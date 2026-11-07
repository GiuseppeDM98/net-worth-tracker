# Allocazione › Consulente

> **When to open this guide** — whoever touches `app/dashboard/allocation/consulente/*`,
> `components/allocation/consulente/*`, `lib/server/allocationAdvice/*`, `app/api/allocation-advice/*`,
> `lib/utils/allocationAdvice{Proposal,Draft,Apply,Narrative,Document}.ts`, `lib/hooks/useAllocationAdvice.ts`,
> `lib/services/allocationAdviceService.ts`, `types/allocationAdvice.ts`. In `AGENTS.md` the stub with the
> essentials stays; here is the full rule. Born on 2026-10-20 (owner's decision: «io sinceramente farei tutto
> adesso in questa sessione»).

## Files

- **Page**: `app/dashboard/allocation/consulente/page.tsx` (the gate on the `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` flag, as
  for the Assistente, and `configured` = the key read on the server), `components/allocation/consulente/ConsulenteClient.tsx`
  (the three views: path · run · report), `ConsulenteWizard.tsx` (the eight screens), `ConsulenteRun.tsx` (the
  stages via SSE), `ConsulenteReport.tsx` (verdict, tiles, markdown, «Applica»).
- **Pure**: `lib/utils/allocationAdviceProposal.ts` (the zod schemas of the answers, the proposal and the candidates; the
  fenced block), `allocationAdviceDraft.ts` (the path's reducer, the draft on localStorage, the prefilled
  answers), `allocationAdviceApply.ts` (the plans of «Applica»: targets, roles, goals; today's base; the loss
  scenarios), `allocationAdviceNarrative.ts` (every sentence), `allocationAdviceDocument.ts` (the document mapper
  for both SDKs), `lib/utils/sseReader.ts`, `lib/utils/cashflowBlock.ts` (the CASHFLOW 12 MESI block, shared with
  every mode of the Assistente and the emails' AI comments, decision 81).
- **Server**: `lib/server/allocationAdvice/prompts.ts` (the three prompts), `run.ts` (the orchestration: context →
  strategy → instruments → review, persisted at every stage), `store.ts` (Admin, `allocationAdvice/{uid}`);
  `app/api/allocation-advice/run/route.ts` (SSE, `maxDuration = 300`, 6 runs an hour), `applied/route.ts`.
- **Client**: `lib/services/allocationAdviceService.ts` (the read under the rules), `lib/hooks/useAllocationAdvice.ts`
  (`queryKeys.allocationAdvice.all`), `lib/services/assetService.ts → updateAssetAllocationRole` (the ONLY field
  «Applica» touches on an asset), `firestore.rules` (`read: canAccess`, `write: false`).
- **Models**: `lib/constants/aiModels.ts` → `ALLOCATION_ADVICE_STRATEGY_MODEL` (Opus 5.5) and
  `ALLOCATION_ADVICE_INSTRUMENTS_MODEL` (Sonnet 5.5).
- **Suites to run after a change here**: `allocationAdviceProposal`, `allocationAdviceDraft`, `allocationAdviceApply`,
  `allocationAdviceNarrative`, `allocationAdvicePrompts`, `allocationAdviceRun`, `allocationAdviceRoutes`,
  `cashflowBlock`, `assistantMonthContextService` ·
  `reactCompilerCoverage` (a ternary inside a `||` in the Wizard was skipped on the first day) · **Browser**
  `e2e/allocation.consulente.spec.ts` (the eight screens on the base fixture, NEVER the run: a test does not open a
  control that spends).

## The path

- **One question per screen, «Indietro» always** (owner, 2026-10-20). The eight screens are
  `ALLOCATION_ADVICE_STEPS` (`profilo · tolleranza · borsa · politica · obiettivi · ruoli · vincoli · riepilogo`);
  **a draft that comes back follows FIRE › Obiettivi** (`reconcileDraftGoals`, 2026-10-20: goals added since are
  appended as on a fresh start, deleted ones dropped, the ones the draft has keep what was typed, a goal typed as new
  stays — the owner's «Rifai» reopened the third run's answers, taken before the goal document existed, and saw
  «Nessun obiettivo registrato»; the «rispecchiano la realtà» checkbox is hidden with zero goals);
  the goals screen has sub-screens — one per existing or added goal, then «cosa manca» with
  «rispecchiano la realtà?» and the free text — and «Indietro» from the roles screen goes back to «cosa manca».
  The reducer is pure (`allocationAdviceDraftReducer`); `describeStepBlock` says why a screen does not advance
  (age and horizon missing, a new goal without a name).
- **The draft lives on THIS browser** (`allocation-advice-draft:{uid}`, `readStoredDraft`/`writeStoredDraft`,
  `try/catch` on every access): a finished run deletes it; a previous document prefills the answers.
- **The loss scenarios are euros on today's base** (`lossScenarios(currentAllocationOnBase(assets).baseTotal)`):
  the same partition as the Allocazione page (tradable + non-tradable, net of debts), never the whole
  net worth.
- **The prefilled answers** (`initialAnswers`): the age from the settings, the goals from FIRE › Obiettivi, the
  roles of the home / pension funds / illiquid assets from the role the assets carry today (`resolveAllocationRoleWithin`),
  the exchange `DEFAULT_EXCHANGE`.
- **The summary is a list of rows, each a link to its screen** (`goto`); «Avvia la ricerca» is
  disabled without the key on the server («Servizio AI non configurato»).

## The run

- **Three calls in series, persisted at every stage** (`runAllocationAdvice`; on the owner's account, mirror of 2026-10-20: 7,1 minutes in all — strategy 2,6, instruments 2,7, review 1,7 — and a report of ~11 000 characters): the context is the YTD bundle
  of the Assistente (`buildAssistantYtdContext` + `formatBundleForPrompt`, portfolio block included) and the
  CASHFLOW 12 MESI block, read beside it before the strategy stage (2026-11); the strategy
  on Opus 5.5 (effort `medium`, `max_tokens` 32 000, no tool); the instruments on Sonnet 5.5 (effort `high`) with
  `web_search_20260209` (`max_uses` 20, `ALLOCATION_ADVICE_WEB_SEARCH_MAX_USES`); the review on Opus 5.5. Each call is a stream read to the
  end by the SDK's accumulator (`beta.messages.stream(...).finalMessage()`): `stop_reason` and the model that
  answered come from the final message (after a mid-stream fallback, the one that finished) — `max_tokens` and
  `refusal` are FAILED stages told in the product's words (`AllocationAdviceStageError`, `retryable`), never a
  half-written proposal read as a whole one. A turn the web search pauses (`pause_turn`, the ceiling of the loop
  on the server side) is resumed by sending the paused response back as an assistant message, up to
  `ALLOCATION_ADVICE_MAX_CONTINUATIONS` times, with the texts joined (2026-10-23; before, the pause failed the stage).
- **The CASHFLOW 12 MESI block** (2026-11): `lib/utils/cashflowBlock.ts` (pure; `buildCashflowBlock` +
  `formatCashflowBlockForPrompt`) over `fetchCashflowBlockInputs(userId, now)` (lib/services/assistantMonthContextService.ts),
  ONE expense query with no lower bound up to the Italian end of the month 12 ahead. The 12 full Italian months are
  the aggregates; the current month up to today stands apart, its rows after today declared as scheduled and not
  counted; the series covers the whole recorded history — from the first month holding a row (a transfer never
  opens it), never before `cashflowHistoryStartYear`, always the 12 full months, no cap (decision 81, 2026-11-07);
  the header names that floor when it cuts the series or leaves a row out, with the count of the rows left out
  («storico contato dal 2025-01, 2 righe precedenti escluse», 2026-11-07);
  the rows after the current month serve the commitments' next date only. Income is a signed sum, dividends and coupons (`dividendIncomeCategoryId`) out of the sources; the
  concentration reading is on the FIRST source's share (≥ 70% «una fonte dominante», the first two ≥ 80% «due fonti
  principali»), the HHI printed beside it. Spending by type and by category id (key by id, label by name), a loan's
  instalment counted whole. The medians (QUARTILE.INC) count from the first full month holding a row, never before
  `cashflowHistoryStartYear`, none under 3 months. The commitments are the recorded series and instalment plans (an amount's change read from the floor on, their
  number, total and next date over every row of the record, 2026-11-07), the
  loans the `debt` rows by `debtAssetId`, the transfers apart (those touching a property named). The accounts are
  `isCashAccount` (types/assets.ts) with the balance `calculateAssetValue` gives (injected as `assetValueOf`) and their
  default debit/credit roles. Every cut is stated in the text, every absence has its sentence («nessuna uscita
  registrata negli ultimi 12 mesi pieni», «nessuna fonte con entrate positive», «nessuna rata nei 12 mesi pieni»),
  a source at or below zero is listed with no share and out of the HHI, and one item left out reads in the singular
  («e altra 1 fonte»). The strategy prints the block after its data, under the note every surface carries
  (`formatCashflowBlockSection`, 2026-11-07). A failed read fails the context stage, retryable — never a strategy
  without the block. The contract sizes the goals' `monthlyContribution` on the block's median monthly
  savings and the cash reserve on its median spending and accounts (decision 46). Amounts print through
  `cachedFormatCurrencyEUR`: it-IT does not group four digits («1200 €», but «31.200 €») and puts U+00A0 before «€»
  — what the formatter prints, not a typo to «fix».
- **The structure is never read from the prose** (the Assistente's rule): strategy and review answer with
  a structured output, ONE object `{ markdown, proposal }` (`allocationAdviceAnswerSchema`, since 2026-10-23): the
  API guarantees the shape, not the sums and the limits (the SDK moves them into the schema's descriptions), and
  `parseAllocationAnswer` checks them. A strategy whose proposal does not hold fails the run; a review that does not
  hold keeps the strategy's proposal (`report.proposal`). The API writes an object's keys in the schema's order: a
  goal's allocation therefore travels as a list of pairs `{ assetClass, percentage }`, and
  `parseAllocationAnswer` puts it back into the saved object. With one object per key, after `trendFollowing` the
  model could no longer write `bonds` and the sum stayed under 100 (tour of 2026-10-23, twice on the same
  goal). A record does not compile: it becomes `additionalProperties`, which structured outputs want `false`.
  The research stays on ONE ```` ```instrument-candidates ```` block (`parseFencedBlock` takes the LAST one and
  validates it with zod), because web search answers with citations and structured outputs refuse them (400);
  without a block it leaves `candidates: null` and the report says so. Strategy and instruments reach the next
  agent with their block put back into the text (`withBlock`).
- **The schemas**: the proposal's classes are `ASSET_CLASS_SEQUENCE` (a key outside the enumeration is rejected);
  the percentages of the classes WITHOUT `fixedAmount` add up to 100 (±0,5); a class's sub-targets add up to 100 or
  are empty; a class appears once; a goal's `recommendedAllocation` adds up to 100; each `assetName`
  is the EXACT name from the STRUMENTI block (the model copies it; `findAssetByName` is case- and space-insensitive and also recognises the
  `displayTicker` alias, which the block prints in place of the ticker: without it, on 2026-10-23 «Applica» lost the quotas of two ETCs).
- **The document** `allocationAdvice/{uid}` is ONE per account, rewritten whole at the start (`setAllocationAdviceAdmin`)
  and then updated per stage (`patchAllocationAdviceAdmin`, `merge: true`, `removeUndefinedDeep`); the dates travel
  as Timestamp and come back as Date field by field (`mapAllocationAdviceData`, shared by the two SDKs). States:
  `draft · running · ready · failed · applied`; `stage` says where the run is or where it stopped. A `running` run
  older than 20 minutes (`RUN_STALE_AFTER_MS`) is considered dead and the page reopens the path.
- **The run starts from the click, never from an effect** (`useConsulenteRun`, 2026-10-20): a first cut opened the stream
  in a `useEffect` with a guard on a ref, and React's StrictMode (dev) mounts the effect twice — the guard kept the
  FIRST closure, already cancelled by its cleanup, and every event was discarded: the page stayed on «Avvio il
  percorso» while the server finished the run. A request that spends minutes and money belongs to the gesture that
  asked for it; `inFlight` refuses a second start while one is running.
- **One request per stage, never the whole run** (owner, 2026-10-20, during the tour: «su Vercel Hobby le funzioni
  devono stare sotto il minuto, vero?»). Vercel Hobby stops a function at 300 s with Fluid compute (60 s without: it
  must be turned on in Vercel → Settings → Functions), and the third run on the mirror lasted 396 s in one request,
  with the strategy alone at 210 s. So `runAllocationAdviceStage` runs ONE stage (`AllocationAdviceRunStage`: `strategy`,
  which creates the document from the answers and includes the context · `instruments` · `review`, which read the
  persisted document — `document` passed in memory by the whole run, read from the store by the route) and the route
  (`maxDuration = 300`, body `{ userId, stage, answers? }`, the rate limit counts only the `strategy`) streams
  `stage` → `done | error` for that stage. The client (`useConsulenteRun.start(answers, from)`) chains the three, reads
  each stream to its `done`, rereads the document after every stage; a failed or cut stage stays
  `resumeFrom` and «Riprova» (`retry`) restarts from there on the persisted document, never from scratch. The review
  rereads strategy and instruments with the blocks put back in place (`withBlock`): the document keeps the stripped
  markdown and the structure, not the raw text. `runAllocationAdvice` stays the three in sequence, for whoever has no
  ceiling. A stage that still exceeds 300 s is a 504 with the document stopped on that stage: «Riprova» repeats it.
- **The answers enter through the same door that wrote them**: `allocationAdviceAnswersSchema` is the schema of the
  screens AND of the route (`parseOr400`).

## The report and «Applica»

- **The verdict is `buildConsulenteVerdict`**: «La proposta è pronta.» with the `summary` and the review date;
  «Allocazione applicata.» with the date; «Il percorso non si è concluso.» with the error's sentence; and, with the
  report but without a valid block, a `warning` that says why «Applica» is not there.
- **A new path reads the plan in force and the why** (owner, 2026-10-20: «quando rivedrò il report alla data
  indicata, quello nuovo tiene conto delle scelte e dei motivi fatti in passato?»): the `strategy` stage reads the
  previous document BEFORE replacing it (`priorPlanOf`, lib/utils/allocationAdviceDocument.ts: the markdown of the
  last report, its change requests, when it was applied, by when it asked to be reviewed and why) and
  `buildStrategyPrompt` appends it to the data as the block «IL PIANO IN VIGORE E IL PERCHÉ»
  (`formatPriorPlanForPrompt`); the strategy's contract, unchanged byte for byte, asks not to start over from zero
  and to add the section «Rispetto al piano precedente». The new document does not keep the old one: the previous
  report lives in the prompt, not in the document.
- **«Chiedi una modifica» relaunches ONLY the review** (owner, 2026-10-20, during the tour: «vorrei liberarmi degli
  ETF obbligazionari per i bond singoli… meglio dirlo all'inizio?»): a request born AFTER reading the report does not
  cost a «Rifai il percorso». The tile under «Il report» (`useConsulenteRevision`, `REVISION_COPY`) sends the route
  `stage: 'revise'` with `request` (1–1000 characters, counted in the rate limit as a run); `runRevise` requires a
  finished report, re-enters `stage: 'review'`, calls Opus 5.5 with `buildRevisionPrompt` — strategy and instruments
  with the blocks put back, the previous report, ALL the requests in order (the last is the new one), the review's
  contract plus the section «La tua richiesta» where the request is not sensible or has a cost — and replaces
  `report` (revised proposal, or the previous one if the block is malformed), appends to `document.revisions`
  (`{ request, at }`, always an array from the mapper) and brings the state back to `ready` (a plan already applied
  is to be applied again). The tile lists the requests made; «Applica» is disabled while the review is running. A
  request worth knowing BEFORE (a constraint, a class to avoid) still goes in the «Vincoli» screen.
- **The tiles**: Allocazione proposta (today → proposal per class, `buildProposalRows` on `currentAllocationOnBase`,
  the held classes the proposal drops appended at the end at 0), Strumenti (the candidates per sub-target,
  «in portafoglio» when already held, the `caveat` in amber), Obiettivi, Ruoli degli asset (only the changes that
  change something, `planRoleChanges`; a name not found is listed and ignored), Il report (markdown), Applica.
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
- **The review date** (`reviewByIso`) lives in the document, not in the settings: the Allocazione page prints it in
  its header (`describeReviewBy` → `describeAllocazioneHeader.reviewBy`) only when the plan has been applied — no
  sixth place in the FIVE places.
- **The prompts** (`lib/server/allocationAdvice/prompts.ts`): `system` identical for every user (role, rules on the
  data, answer contract, the block's schema), everything of the user's in `userContent` (`formatAnswersForPrompt`,
  the data block, the other agent's result). The user's answers WIN over the model's preference (a chosen role
  stays; the model may say why it would decide otherwise, in the text).

## The visual direction

The Consulente follows DESIGN.md § 5 → «AI Surfaces», concept B «La scena» (chosen on 2026-11-06, decision 74 of
doc/ai/README.md): **The Path-Scene Rule** (one stage, the rail that says where the path is and fills with the run's
stages, the slide forward and back, the report's cascade), **The Question-Card Rule** (the interview's cards; the
scene's footer owns «Continua» and «Avvia la ricerca») and **The AI-Accent Rule** (the accent on what the model wrote
and, on hover and focus only, on «Avvia il colloquio», «Continua», «Avvia la ricerca», «Riprova», «Rivedi il report»).
The code follows it from the redesign of the path, the run and the report on (AI-03); until then § The path, § The run
and § The report and «Applica» describe what renders, and `app/globals.css` serves `oklch(0.65 0.2 305)` in both modes
with no `--ai-glow` (the light value and the glow land with that redesign).

## Composizione mobile

No composition, by choice: like the Assistente (DESIGN.md → The Conversation-Is-Content Rule) the content is
a path — one column at 720px, one card per screen, buttons at 44px below `desktop:`; no strip, no closed rows,
no `mobile-sections:` memory. It is not among the surfaces of `mobile:census` (the route is not in
`navigation.ts`: it is reached from Allocazione's «Consulente» button, on desktop in the header and below the tiles
on a phone, and from the row under the Assistente's conversation).

## Per-page blind spots
- **The strategy reads this year's rows twice** (2026-11): the YTD bundle and the cashflow block query them apart —
  accepted, the bundle stays the Assistente's, and the block is read once per strategy, never by the instruments or
  the review.
- **The review invite** (owner, 2026-10-20, after applying the first production plan: «nei giorni vicino alla data,
  un pulsante "revisione con il Consulente"»): `reviewDueState(document, todayIso)` (lib/utils/allocationAdviceNarrative.ts)
  says `later · soon · due` against the applied plan's `reviewByIso` — `soon` within `REVIEW_SOON_DAYS` (30), `due`
  on the day and after, `none` without an applied plan. On Allocazione the «Consulente» button becomes the primary
  «Rivedi con il Consulente» (`REVIEW_INVITE_LABEL`) linking to `/consulente?rivedi=1`, which the page reads on the
  server (`searchParams`) and hands to the client as `startFresh`: the screens open over the applied plan as «Rifai il
  percorso» would, and the new run starts from the plan in force. The report's applied verdict carries
  `describeReviewInvite` (tone `warning` once due). Before the date, «Rifai il percorso» at the bottom anticipates it.
- **The run's state lives on the page, not in the wizard** (owner's first production run, 2026-10-20): the document
  becomes `running` at the first stage and the query rereads it after every stage, so a `showReport` that looked only
  at the document flipped the page to the report's «in corso» view after the strategy — spinners gone, «Ricomincia il
  percorso» offered mid-run (the chain kept going in the unmounted hook's closure and the report did arrive).
  `ConsulenteClient` owns `useConsulenteRun` and hands it to the wizard; `pageShowsReport` (lib/utils/
  allocationAdviceDocument.ts, with `isRunStale`) keeps the run's screen while the run is `running` or `failed`.
- **The E2E spec opens over a finished report** (2026-10-20: two real runs on the E2E account at :3100 left a `ready`
  document in the emulators, and the full Playwright run went red twice on «Passo 1 di 8»): `openConsulente` waits for
  step 1 OR «Rifai il percorso» and clicks the latter. The emulators keep `allocationAdvice/test-user-1` between runs;
  a real run on that account is never cleaned by the suite.
- **The exchange is a closed list, with «Altra…» opening a free field** (owner, 2026-10-20: the first version was an
  `Input` over a `datalist`, whose arrow looked like a dropdown and was not one): `ExchangeField` shows
  `EXCHANGE_OPTIONS` plus `EXCHANGE_OTHER`; «Altra…» is LOCAL state so the field stays open while the text is empty
  (`answers.exchange` is '' until typed, and step 3 does not pass), and a draft that comes back with an unlisted
  exchange reopens it (`isListedExchange`). The free text goes to the instrument agent as written.

- **The run costs money and takes minutes** (three calls, two on Opus 5.5, one with web search): «Puoi lasciare la
  pagina» is true — every stage is saved — but the closed SSE connection does not stop the server; whoever reopens
  sees the saved stage and the page rereads the document while it is `running`. A run cut by the platform stays
  `running` until the 20-minute stale mark.
- **One run per account at a time**: there is one document; «Rifai il percorso» opens the path OVER the document
  (which stays until a new run replaces it with `set`).
- **«Applica» is not idempotent on the goals**: pressed twice it would create the new goals twice — which is why
  after `done` the button stays disabled and the `applied` document no longer shows it.
- **The demo has no Consulente**: it writes the settings, and the demo's settings are everyone's (`useDemoMode`).
- **The rules are inert until they are deployed** (`npx firebase deploy --only firestore:rules`; done by the owner on 2026-10-20, the Consulente tried in production): before the deploy
  the page does not read the document (permission-denied → the read fails and the page says so).
- **No E2E spec of the run**, by the rule of the tests that do not spend; the real run was made on the
  mirror on 2026-10-20 with the owner's key (the outcomes in the session's SESSION_NOTES and in the commit).
