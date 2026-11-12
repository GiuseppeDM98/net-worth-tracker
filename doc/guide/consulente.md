# Allocazione › Consulente

> **When to open this guide** — whoever touches `app/dashboard/allocation/consulente/*`,
> `components/allocation/consulente/*`, `lib/server/allocationAdvice/*`, `app/api/allocation-advice/*`,
> `lib/utils/allocationAdvice{Proposal,Draft,Apply,Narrative,Document,Interview,Bonds}.ts`, `lib/utils/questionSet.ts`,
> `components/ui/question-card.tsx`, `lib/hooks/useAllocationAdvice.ts`,
> `lib/services/allocationAdviceService.ts`, `types/allocationAdvice.ts`. In `AGENTS.md` the stub with the
> essentials stays; here is the full rule. Born on 2026-10-20 (owner's decision: «io sinceramente farei tutto
> adesso in questa sessione»).

## Files

- **Page**: `app/dashboard/allocation/consulente/page.tsx` (the gate on the `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` flag, as
  for the Assistente, and `configured` = the key read on the server), `components/allocation/consulente/ConsulenteClient.tsx`
  (the three views: path · run · report), `ConsulenteWizard.tsx` (the eight screens and the interview's scene),
  `ConsulenteInterviewScene.tsx` (the rounds' cards, the skeleton, the scene's footer; 2026-11-08),
  `useConsulenteInterview.ts` (one round per gesture, aborted by «Salta il colloquio»), `ConsulenteRun.tsx` (the
  run's screen and `StageRows`, which the report's running view shares), `ConsulenteReport.tsx` (the running view,
  the data, «Applica»'s writes; the book is `ConsulenteBook.tsx`, its page bodies `ConsulenteBookPages.tsx`, the turn
  `useSceneTurn.ts`), `ConsulenteInterviewTile.tsx` (`InterviewBody`), `ConsulenteRevisionTile.tsx`
  (`useRevisionDraft`, `RevisionBody`).
- **Primitives**: `components/ui/choice-list.tsx` (`ChoiceList`, every choice of the path and of the Compravendita),
  `components/ui/question-card.tsx` (`QuestionCard`: ONE question a model asks, shared with the Assistente's in-chat
  questions), `components/ui/path-rail.tsx` (`PathRail`: the path's eight ticks, the interview's three, the run's
  four segments, the book's pages (buttons from `desktop:`)), `Tile`'s `generated`
  and the classes of `lib/constants/aiAccent.ts`, `sceneVariants` in `lib/utils/motionVariants.ts`.
- **Pure**: `lib/utils/questionSet.ts` (the one question schema — kinds, options, the reserved rows «Altro…» and
  «Preferisco non dire», the lenient parser, the describer of an answer, the prompt lines — shared with the
  Assistente), `allocationAdviceInterview.ts` (the interview's reducer, `canRequestRound`, the block sentence; it reaches zod
  through `questionSet`, so nothing the Allocazione page loads may import it — «1 tornata» / «N tornate» is
  `describeRoundCount` in the narrative for that reason), `lib/utils/allocationAdviceProposal.ts` (the zod schemas of the answers, the proposal and the
  candidates; the fenced block; the interview round's wire and stored shapes, `parseInterviewRound`),
  `allocationAdviceBook.ts` (the book: the page table, the heading reader, the address; pure, imported only on the
  Consulente's route: by the book, and by `ConsulenteClient` for `bookPageUrl` — never by the Allocazione page), `allocationAdviceDraft.ts` (the path's reducer, the draft on localStorage with its `phase` and `interview`,
  `reopenStoredDraft`, the prefilled answers), `allocationAdviceApply.ts` (the plans of «Applica»: targets, roles, goals; today's base; the loss
  scenarios), `allocationAdviceNarrative.ts` (every sentence), `allocationAdviceDocument.ts` (the document mapper
  for both SDKs), `lib/utils/sseReader.ts`, `lib/utils/cashflowBlock.ts` (the CASHFLOW 12 MESI block, shared with
  every mode of the Assistente and the emails' AI comments since 2026-11-07).
- **Server**: `lib/server/allocationAdvice/prompts.ts` (the builders of the strategy, the instruments, the revision and the review, the interview's and the IL COLLOQUIO
  block), `run.ts` (the orchestration: context → strategy → instruments → review, persisted at every stage;
  `runInterviewRound`, which persists nothing; the OBBLIGAZIONI block and the previous paths read beside the
  context, 2026-11-08), `store.ts` (Admin, `allocationAdvice/{uid}` and the archive `allocationAdvice/{uid}/history`);
  `lib/utils/allocationAdviceBonds.ts` (pure: which holdings are the bond part, which cost a profile read, the block);
  `app/api/allocation-advice/run/route.ts` (SSE, `maxDuration = 300`, 12 model requests an hour per warm instance:
  interview rounds, strategy, revise), `applied/route.ts`.
- **Client**: `lib/services/allocationAdviceService.ts` (the read under the rules), `lib/hooks/useAllocationAdvice.ts`
  (`queryKeys.allocationAdvice.all`), `lib/services/assetService.ts → updateAssetAllocationRole` (the ONLY field
  «Applica» touches on an asset), `firestore.rules` (`read: canAccess`, `write: false`).
- **Models**: `lib/constants/aiModels.ts` → `ALLOCATION_ADVICE_STRATEGY_MODEL` (Opus 5.5: the interview, the
  strategy, the review) and `ALLOCATION_ADVICE_INSTRUMENTS_MODEL` (Sonnet 5.5).
- **Suites to run after a change here**: `questionSet`, `allocationAdviceInterview`, `allocationAdviceProposal`, `allocationAdviceBook`,
  `allocationAdviceDraft`, `allocationAdviceDocument`, `allocationAdviceBonds`, `allocationAdviceApply`, `allocationAdviceNarrative`,
  `allocationAdvicePrompts`, `allocationAdviceRun`, `allocationAdviceRoutes`, `cashflowBlock`,
  `assistantMonthContextService`, `motionVariants` and the Testing Library suites `choiceList`, `pathRail`, `tile`,
  `questionCard`, `consulenteInterviewTile`, `consulenteRevisionTile`, `consulenteBook`, `useSceneTurn`, `consulenteRun`, `useConsulenteRun`, `useConsulenteInterview`; for the bond block `instrumentProfileService`, `exposureYahooSource`, `assistantPortfolioContext` ·
  `reactCompilerCoverage` (a ternary inside a `||` in the Wizard was skipped on the first day) · **Browser**
  `e2e/allocation.consulente.spec.ts` (the eight screens), `allocation.consulente.interview.spec.ts` and
  `.interview.mobile.spec.ts` (the interview), `allocation.consulente.mobile.spec.ts` (390: the strip, 44px, the
  overflow, reduced motion), `allocation.consulente.report.spec.ts` (the book at 1440: the pages, the rail, the address, the accent, the
  revision's round, the print sheet), `allocation.consulente.book.mobile.spec.ts` (the book at 390: the slide, the
  scroll to the card, «Indice», the footer), both on the documents planted by `e2e/consulenteReport.ts`:
  `/api/allocation-advice/run` is always faked with `page.route` (`e2e/consulenteInterview.ts` scripts the rounds and
  records the bodies), no test spends.

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
- **The path is a scene** (2026-11-07): `PathRail` draws the eight steps — a strip above the card below
  `desktop:`, a 160px column at 1440 with each step's name in 11px (a `sr-only` name on the strip), one
  `aria-current="step"`, ticks that are not buttons; the strip is 24px tall in both modes, so the card stays put when
  the run replaces the path (2026-11-07). The headline and the body slide 24px in the direction of travel
  (`sceneVariants`: 0.25 s in, 0.18 s out; a 0.15 s fade under reduced motion) inside
  `AnimatePresence mode="wait" initial={false}`; the eyebrow and the footer stay; after a change the headline takes
  the focus, unless the reader already moved it, and on a mount nothing moves. The direction is state set with the
  dispatch, never a ref (the React Compiler would skip the Wizard). Every choice is a `ChoiceList` row.
- **The draft lives on THIS browser** (`allocation-advice-draft:{uid}`, `readStoredDraft`/`writeStoredDraft`,
  `try/catch` on every access): a finished run deletes it; a previous document prefills the answers.
- **The loss scenarios are euros on today's base** (`lossScenarios(currentAllocationOnBase(assets).baseTotal)`):
  the same partition as the Allocazione page (tradable + non-tradable, net of debts), never the whole
  net worth.
- **The prefilled answers** (`initialAnswers`): the age from the settings, the goals from FIRE › Obiettivi, the
  roles of the home / pension funds / illiquid assets from the role the assets carry today (`resolveAllocationRoleWithin`),
  the exchange `DEFAULT_EXCHANGE`.
- **The summary is a list of rows, each a link to its screen** (`goto`); its primary is «Avvia il colloquio» («Torna
  al colloquio» once a round exists, with «Ricomincia il colloquio»), its secondary «Salta il colloquio e avvia la
  ricerca»; both are disabled without the key («Servizio AI non configurato»); «Avvia il colloquio» glows on hover and focus
  only (`AI_CONTROL_ACCENT_CLASS`, DESIGN.md → The AI-Accent Rule: it asks the model), «Torna al colloquio» and the skip never (2026-11-06).
- **The interview** (2026-11-08, PR #509): after the summary, a scene of its own in the same card
  (`ConsulenteInterviewScene`; «Passo N di 8» untouched, the eyebrow «Colloquio · tornata N di 3» its only
  `TILE_EYEBROW_CLASS`), where the Consulente reads answers and data and asks 0–4 pointed questions, up to three
  rounds: `canRequestRound` is false once three rounds stand, when the last is `satisfied`, when it asked nothing
  or when the user skipped; «Continua» asks the next round with every previous round and its answers, otherwise the
  primary reads «Avvia la ricerca». A received round enters the draft AT ONCE with `answers: []` and every answer is
  written into that last round in place (`interviewReducer`), so `writeStoredDraft` persists it and a reload shows
  the round without a request (`phase: 'interview'` kept only with a valid round, `readStoredDraft`); the Wizard
  opens through `reopenStoredDraft`, which drops a stored interview older than the last document's `updatedAt`
  («Rifai il percorso» never prefills rounds a run already used). «Salta il colloquio» commits the rounds as they
  stand — an unanswered question has no entry, the prompt prints «non risposta» — and starts the strategy with
  `skipped: true`; while a round is asked the scene shows the previous note over a skeleton of two cards
  (`aria-busy`, «Indietro» and the primary held) and the skip aborts the fetch (`AbortController`; the slot is
  spent, the late event ignored). The rail's three ticks light one round at a time (`PathRail.interview.reached`,
  the round number, 1-based). Every `QuestionCard` carries «Altro…» (forced by the parser, 2026-11-01) and
  «Preferisco non dire» last, both exclusive rows in a multiple question (2026-11-01), and no button: the footer owns
  the one primary of a round (2026-11-01).

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
- **The run says how long a stage usually takes** (2026-11-07): each row of `StageRows` prints
  `STAGE_COPY[stage].detail` and «di solito ~N min» (`STAGE_TYPICAL_MINUTES`: strategy 2, instruments 2, review 1,
  nothing for the context — about five minutes in all at effort `medium`, 2026-10-23); the active row adds the
  elapsed time («m:ss», `aria-hidden`, from `stageStartedAt`, stamped by `useConsulenteRun` at every `stage` event)
  and the accent on its frame; a failed run marks the stages before `resumeFrom` done and that one failed
  (`runStageStates`). `PathRail` in run mode fills one segment per stage when it becomes active: stage status, never
  a percentage; its wrapper is a plain div (the list is `aria-hidden`): the «Dove sei» landmark is the path's alone
  (2026-11-07).
- **The OBBLIGAZIONI block** (owner, 2026-11-08, after the interview's phase F on the mirror: «se uno ha ETF obbligazionari analizzare
  anche le loro duration … per proporre un altro ETF che copra una duration diversa»): `lib/utils/allocationAdviceBonds.ts`
  (pure) over the holdings of the YTD bundle — the single bonds by TYPE (`bond`, with `maturityIso` from
  `bondDetails.maturityDate` and the coupon the DIVIDENDI facts know), the funds by CLASS (`bonds`, never an account or
  a loan) with the effective duration and the average maturity Yahoo publishes (`topHoldings.bondHoldings`, read as
  `InstrumentFundProfile.bond` through the Esposizione's shared profile cache, `resolveInstrumentProfiles` with the
  `fund` module, one request per bond ETF with a raw ticker: a cached document written before the field existed is
  asked once more whatever its age, `schema` in `yahooSource.ts`). The block closes the data of the interview and
  the strategy (`buildConsulenteContext`) and the holdings of the instrument search; three absences are named apart
  («scadenza non registrata», «duration non pubblicata da Yahoo», «duration non letta» when the profile read threw —
  a failed read never fails the run). Yahoo's figures are «secondo Yahoo, non verificate»: the instruments contract
  makes the second agent confirm a bond ETF's duration with the web search and write it in the candidate's
  `duration` (years, 0–40, `instrumentCandidateSchema`; the report prints « · duration 2,4 anni»), the strategy
  contract makes every bond sub-target say which horizon and which goal it covers (and which horizon stays
  uncovered), the interview contract asks what the bond part is for and whether singles or ETFs when the block has
  rows or the class will weigh. Not a fixed screen of the path (the eight screens stay as drawn on 2026-11-06): a reading rule.
- **The previous paths** (owner, 2026-11-08: «tra un anno ha paura e lo rifa … il consulente nota nelle sue parole
  della paura o della fomo»): a new path's interview rounds and strategy read «--- I PERCORSI PRECEDENTI ---»
  (`formatPreviousPathsForPrompt`): the live document when it has a report — nothing has replaced it during the
  interview; at the strategy it is read before the new one — then the archive, the most recent first, at most
  `ALLOCATION_ADVICE_HISTORY_LIMIT` (6). Per path: its dates, the answers of then in two lines, the user's own
  words (what was missing, the notes, the goals' notes), the interview of then with its answers
  (`formatQuestionAnswersForPrompt`), the requests for changes, the proposal in one line. The plan in force stays
  printed whole before it (IL PIANO IN VIGORE); the revision's round reads neither (its report is the context). The
  reading rule in both contracts: a change in tolerance, horizon, goals or constraints the data do not explain is a
  question (interview) or a sentence of «La situazione» (strategy); fear, haste or euphoria read in the words — of
  then or of today — are said with the sentence that shows them, never judged. A failed archive read never fails a
  path: the block says it and lists the live one alone.
- **The CASHFLOW 12 MESI block** (2026-11): `lib/utils/cashflowBlock.ts` (pure; `buildCashflowBlock` +
  `formatCashflowBlockForPrompt`) over `fetchCashflowBlockInputs(userId, now)` (lib/services/assistantMonthContextService.ts),
  ONE expense query with no lower bound up to the Italian end of the month 12 ahead. The 12 full Italian months are
  the aggregates; the current month up to today stands apart, its rows after today declared as scheduled and not
  counted; the series covers the whole recorded history — from the first month holding a row (a transfer never
  opens it), never before `cashflowHistoryStartYear`, always the 12 full months, no cap (2026-11-07);
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
  savings and the cash reserve on its median spending and accounts (2026-11-01). Amounts print through
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
- **The archive** `allocationAdvice/{uid}/history/{createdAt ISO}` (owner, 2026-11-08, after the interview's phase F on the mirror): the
  document a new path replaces is copied there whole, BEFORE the new one is written, when it has a report
  (`archiveAllocationAdviceAdmin`; a path abandoned before its report leaves no trace; the same path archived twice
  overwrites itself). Admin only, both ways (`rules: read, write: false` on the subcollection; `mirror:remove`'s
  `recursiveDelete` takes it with the document). Nothing on a page reads it yet: the Consulente does — see the run.
- **Reset of one account** (`npm run consulente:reset -- <email>`, `scripts/consulenteReset.mts`, 2026-11-08): the
  owner's tool for «rifare il giro da zero» in production at the end of the AI series. Dry run by default (prints the
  target project, the uid, the document's status and dates, the applied summary, the archived paths); with `--yes` it
  writes a JSON backup under `~/Documents/Backup/net-worth-consulente/` and `recursiveDelete`s
  `allocationAdvice/{uid}` with its `history`, then re-reads to prove both are gone. It never touches what «Applica»
  wrote (targets, roles, goals), the shared profile cache or another account; `consulente:reset:emulator` is the same
  against the emulators (tried on the E2E account on 2026-11-08). The browser's draft is not on the server.
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
  (`maxDuration = 300`, body `{ userId, stage, answers?, request?, interview?, revision? }`, the rate limit counts
  the interview rounds, the `strategy` and `revise`: 12 an hour per warm instance) streams
  `stage` → `done | error` for that stage. The client (`useConsulenteRun.start(answers, from, interview)`) chains the three, reads
  each stream to its `done`, rereads the document after every stage; a failed or cut stage stays
  `resumeFrom` and «Riprova» (`retry`) restarts from there on the persisted document, never from scratch — a request
  that throws (a non-ok status, a stream the network drops) is remembered by the stage in flight too, never by the
  chain's start (2026-11-07: before, a drop during the instruments marked the strategy failed and «Riprova» re-paid it). The review
  rereads strategy and instruments with the blocks put back in place (`withBlock`): the document keeps the stripped
  markdown and the structure, not the raw text. `runAllocationAdvice` stays the three in sequence, for whoever has no
  ceiling. A stage that still exceeds 300 s is a 504 with the document stopped on that stage: «Riprova» repeats it.
- **The answers enter through the same door that wrote them**: `allocationAdviceAnswersSchema` is the schema of the
  screens AND of the route (`parseOr400`); the interview through `interviewSchema` (`askedAt` coerced to a Date).
- **The interview round** (2026-11-08): `stage: 'interview'` is a branch of the route that never enters
  `runAllocationAdviceStage` — `runInterviewRound` builds the strategy's context (the YTD bundle and the cashflow
  block, read once), calls the strategy's model and effort with 16 000 tokens, `interviewRoundSchema` as the
  structured output and no web search, and streams ONE terminal event, `interview` (the round with its model and
  clock) or `error`; it writes nothing to `allocationAdvice/{uid}`. The parser is lenient because the API keeps only
  types, required and `additionalProperties` of the schema: five questions keep four, a repeated id or a one-option
  question is refused and logged, the reserved option values dropped, a note over 600 characters cut. The strategy
  writes `interview` into the new document and prints it (the IL COLLOQUIO block, `formatInterviewForPrompt`) right
  after the answers, closed by «Tieni conto di queste risposte nella sezione «La situazione».»; the review prints the
  same block; a skip with zero rounds is the one sentence «L'utente ha saltato il colloquio.». `system` never changes.
  The route refuses a skipped interview, a fourth round and a revision round after one (400, no slot).

## The report as a book

- **The report is read as a book** (owner, 2026-11-08: «una specie di libro, dove ogni pagina ha un senso logico da
  sola e quelle dopo continuano il racconto»): `ConsulenteBook` shows ONE page at a time on the path's scene card, the
  rail beside it (DESIGN.md → The Path-Scene Rule). The pages, in order, are `buildBookPages`
  (lib/utils/allocationAdviceBook.ts): «In una frase» (the cover: the verdict, then the text's first section;
  «La situazione» when the text is the strategy alone) · «L'allocazione proposta» · «Gli strumenti» · «Gli obiettivi» ·
  «Casa, fondi pensione e illiquidi» · «Cosa fare adesso» · «Rischi e revisione» · «Il colloquio» · «Chiedi una
  modifica» · «Applica». A page exists when it has text or figures: the proposal's two with a proposal (the review
  date is required, so «Rischi e revisione» always follows a proposal), «Gli strumenti» with the instruments,
  «Gli obiettivi» with the proposal's goals, the roles' page with a change or a name not found, «Il colloquio» with a
  round, «Chiedi una modifica» with a report, «Cosa fare adesso» only with its section; the cover and «Applica» always.
- **The text splits by its sections onto the page of the tile it explains** (`splitReportSections`,
  `assignSections`): three heading shapes open a section — an ATX heading (`#`–`####`), a line that is only bold
  («**Gli strumenti**», «2. **…**»), and the contracts' own list shape «1. **In una frase** — testo» when the bold IS a
  page's alias —, never inside a fenced block. When an ATX heading names a page the ATX headings of its level open the
  sections and the bold shapes are text; otherwise the bold shapes do. The aliases are the contracts' titles
  (normalised: no accents, numbers, bold, colons): the review's seven, the strategy's «La situazione», «Obiettivi»,
  «Cosa cambia rispetto a oggi», «Rispetto al piano precedente», the revision's «La tua richiesta». A heading the reader
  does not know lands on the page before, under its own `##` line; the heading line is dropped only when it is the
  page's printed title. When the known headings land on fewer than two pages the book is DEGENERATE: the cover holds
  the verdict alone and ONE page «Il report» (or «La strategia») holds the whole text. The reader decides only where
  the prose is shown: no figure and no decision is taken from it. On the first real path read as a book (the mirror,
  2026-11-12) the review wrote its seven sections as `##` headings, each its page's own title, and bold-only lines inside
  them (a class in «Gli strumenti», a step in «Cosa fare adesso») stayed text on that page: ten pages, none on «Il
  report».
- **The pager** is the card's footer on every width: «Indietro» (disabled on the first page) and, below `desktop:`,
  «Indice»; the page's own buttons — «Avanti» (absent on «Applica»), on «Chiedi una modifica» «Rivedi il report» and
  «Salta le domande» with «Avanti» as an outline, on «Applica» «Applica alle impostazioni» and «Rifai il percorso».
  Below `tablet:` a column, the page's buttons full width on top. From `desktop:` the rail's labels are buttons, ONE
  Tab stop (the arrows move along the rail); below it «Indice» opens «Vai a una pagina», a `ResponsiveModal` of 44px
  rows — the route's one modal. The WHOLE page slides along the turn, the leaving page `inert`; after a turn the
  headline takes the focus (`useSceneTurn`, shared with the Wizard: only the scene the turn renders may take it, so a
  gesture made while the previous scene is still sliding in keeps its focus, 2026-11-12) and the card's top scrolls into view when it is
  above the page's scroll box. From `desktop:` the book's grid is `items-start`: a short page's card hugs its text
  instead of stretching to the ten-row rail, where its footer floated mid-card (seen at 1440 in phase E, 2026-11-11);
  the path's grid keeps the stretch.
- **A page is an address**: `?pagina=<id>` opens it (`page.tsx` reads it on the server); every turn writes it with
  `replaceState` from the gesture (`bookPageUrl`: `pagina` set, removed on the cover; `rivedi` removed), so the history
  never grows; «Rifai il percorso» removes it. The page id lives in `ConsulenteClient`, BY ID and for one document
  (`createdAt`): a revision that rewrites the report leaves the reader on «Chiedi una modifica»; a page that no longer
  exists is the cover; a document newer than the page's opening opens on its cover whatever the address says.
- **The accent follows the author**: a page is `generated` when its body is the model's — the proposal's pages, the
  instruments, the goals, the roles, «Cosa fare adesso», «Rischi e revisione», «Il report»; the cover only when it
  carries model text (the verdict it opens with is never accented). «Il colloquio», «Chiedi una modifica» and
  «Applica» never are. «{model} · {date}» of the text's source is the cover's aside (the `report` page's in the
  degenerate book).
- **The motion**: the page shown at open cascades its blocks once per JS session (`consulenteReportEntrance.cascade`)
  and does not slide; the proposed percentages count up the first time «L'allocazione proposta» mounts in the session
  (`consulenteReportEntrance.countUp`, 620 ms), whichever page was opened; under reduced motion the turn fades and
  nothing cascades or counts.
- **A printer gets the whole book** (`ConsulenteBookPrint`): the verdict, then every page but «Chiedi una modifica»
  and «Applica», its title, aside, reading, text and figures, no accent and no button; the grid is `print:hidden`, and
  `app/globals.css` opens the shell for the printer only while `[data-book-print]` is in the page.
- **The running view is unchanged**: the verdict, «Le fasi» and «Ricomincia il percorso». A failed document is a book
  over the text it has, the negative verdict on the cover and «Rifai il percorso» alone on «Applica».
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
  cost a «Rifai il percorso». The page before «Applica» (`useConsulenteRevision`, `REVISION_COPY`) sends the route
  `stage: 'revise'` with `request` (1–1000 characters; one round of questions about it first, «Salta le domande»
  available; the round and the revise each take a slot; the round stored as `revisionInterview`, printed by
  `buildRevisionPrompt` after the requests and shown under the last request — 2026-11-01); `runRevise` requires a
  finished report, re-enters `stage: 'review'`, calls Opus 5.5 with `buildRevisionPrompt` — strategy and instruments
  with the blocks put back, the previous report, ALL the requests in order (the last is the new one), the review's
  contract plus the section «La tua richiesta» where the request is not sensible or has a cost — and replaces
  `report` (revised proposal, or the previous one if the block is malformed), appends to `document.revisions`
  (`{ request, at }`, always an array from the mapper) and brings the state back to `ready` (a plan already applied
  is to be applied again). The page lists the requests made; «Applica» is disabled while the review is running. A
  request worth knowing BEFORE (a constraint, a class to avoid) still goes in the «Vincoli» screen. The revision's
  round lives in the book's memory (`useRevisionDraft`): it survives a turn, not a reload: a round with no question sends the
  revision at once, «Salta le domande» while the round is asked aborts it and sends `{ rounds: [], skipped: true }`.
- **«Il colloquio»** (`InterviewBody`, its page between «Rischi e revisione» and «Chiedi una modifica»):
  the rounds the Consulente asked before the strategy, each with its note, its questions and what the user answered
  («non risposta» for what was skipped), the aside «1 tornata» / «N tornate» (« · saltato» when skipped); nothing
  with zero rounds (2026-11-01). It recaps the user's own words, so it does NOT wear `generated` (2026-11-06).
- **The pages' figures** are the former tiles' bodies, moved (`ConsulenteBookPages.tsx`): «L'allocazione proposta»
  (today → proposal per class, `buildProposalRows` on `currentAllocationOnBase`, the held classes the proposal drops
  appended at the end at 0; the footnote the base sentence alone), «Gli strumenti» (the candidates per sub-target,
  «in portafoglio» when already held, the `caveat` in amber), «Gli obiettivi», «Casa, fondi pensione e illiquidi»
  (only the changes that change something, `planRoleChanges`; a name not found is listed and ignored), «Rischi e
  revisione» (the aside «rivedi entro il …», the reason, `proposal.risks` as rows), «Chiedi una modifica», «Applica».
  The generated card — the 1px `--ai-accent` border, the accented eyebrow — follows § The report as a book above;
  «Le fasi» of the running view wears it.
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

The Consulente follows DESIGN.md § 5 → «AI Surfaces», concept B «La scena» (chosen by the owner on 2026-11-06 among three
drawn concepts, archived in `git log -- doc/ai/reference/`): **The Path-Scene Rule** (one stage, the rail that says where the path is and fills with the run's
stages, the slide forward and back, the first page's cascade), **The Question-Card Rule** (the interview's cards; the
scene's footer owns «Continua» and «Avvia la ricerca») and **The AI-Accent Rule** (the accent on what the model wrote
and, on hover and focus only, on «Avvia il colloquio», «Continua», «Avvia la ricerca», «Riprova», «Rivedi il report»).
The code follows it since the redesign of the path, the run and the report (2026-11-07, PR #507): § The path, § The run
and § The report as a book describe what renders; `app/globals.css` serves `oklch(0.56 0.2 305)` in `:root`,
`oklch(0.65 0.2 305)` in `.dark` and `--ai-glow` once. The interview's scene followed on 2026-11-08 (PR #509).

## Composizione mobile

No composition, by choice: like the Assistente (DESIGN.md → The Conversation-Is-Content Rule) the content is
a path — one column at 720px (900px at 1440, the rail's 160px column beside the card), one card per screen, buttons
at 44px below `desktop:`; no `VerdictStrip` — the rail's ticks above the card are not one: the page is still not a
composed page —, no closed rows, no `mobile-sections:` memory. The book is not a composed page either: one card,
one page at a time; «Indice» is the one `ResponsiveModal` of the route. It is not among the surfaces of `mobile:census` (the route is not in
`navigation.ts`: it is reached from Allocazione's «Consulente» button, on desktop in the header and below the tiles
on a phone, and from the row under the Assistente's conversation).

## Per-page blind spots
- **jsdom ignores `inert`** (2026-11-11): during a turn the leaving page is still in the DOM with the same buttons, so a
  DOM test of the book waits until `[data-scene]` is the new page before it clicks (`landed(id)` in
  `__tests__/consulenteBook.test.tsx`); that the leaving page IS inert is proven in the browser, frame by frame
  (`e2e/allocation.consulente.book.mobile.spec.ts`, red without it).
- **The strategy reads this year's rows twice** (2026-11): the YTD bundle and the cashflow block query them apart —
  accepted, the bundle stays the Assistente's, and the block is read once per strategy and once per interview round (`buildConsulenteContext`), never by the instruments or
  the review.
- **A bond ETF's duration in the context is Yahoo's, up to 30 days old, and may differ from the factsheet**
  (2026-11-08): the block says «secondo Yahoo, non verificate» and the instruments contract has the second agent
  confirm it before a candidate carries `duration`; a fund Yahoo does not describe («non pubblicata») is still in the
  block with its value, so the strategy can ask the search for it. The context never rereads Yahoo: the Esposizione's
  TTL rules it.
- **A path abandoned before its report is not in the archive** (2026-11-08): the previous paths are those with a
  report; «Riprova» after a failed strategy creates a new document with the same answers, and archiving the failed
  one would have listed the same words twice. The one exception the model sees: the live document without a report
  is listed as nothing, not as «fallito».
- **The report reaches neither the PDF nor the emails** (checked on 2026-11-08: no reader of `allocationAdvice` under
  `lib/server/`, `lib/services/` or `app/api/` other than the Consulente's own routes): it lives on its page alone, and
  it prints from the browser, every page but the two that act.
- **The review invite** (owner, 2026-10-20, after applying the first production plan: «nei giorni vicino alla data,
  un pulsante "revisione con il Consulente"»): `reviewDueState(document, todayIso)` (lib/utils/allocationAdviceNarrative.ts)
  says `later · soon · due` against the applied plan's `reviewByIso` — `soon` within `REVIEW_SOON_DAYS` (30), `due`
  on the day and after, `none` without an applied plan. On Allocazione the «Consulente» button becomes the primary
  «Rivedi con il Consulente» (`REVIEW_INVITE_LABEL`) linking to `/consulente?rivedi=1`, which the page reads on the
  server (`searchParams`) and hands to the client as `startFresh`: the screens open over the applied plan as «Rifai il
  percorso» would, and the new run starts from the plan in force. The report's applied verdict carries
  `describeReviewInvite` (tone `warning` once due). Before the date, «Rifai il percorso» on the last page anticipates it.
- **The run's state lives on the page, not in the wizard** (owner's first production run, 2026-10-20): the document
  becomes `running` at the first stage and the query rereads it after every stage, so a `showReport` that looked only
  at the document flipped the page to the report's «in corso» view after the strategy — spinners gone, «Ricomincia il
  percorso» offered mid-run (the chain kept going in the unmounted hook's closure and the report did arrive).
  `ConsulenteClient` owns `useConsulenteRun` and hands it to the wizard; `pageShowsReport` (lib/utils/
  allocationAdviceDocument.ts, with `isRunStale`) keeps the run's screen while the run is `running` or `failed`.
- **The E2E spec opens over a finished report** (2026-10-20: two real runs on the E2E account at :3100 left a `ready`
  document in the emulators, and the full Playwright run went red twice on «Passo 1 di 8»): `openConsulente` waits for
  step 1, the book or «Ricomincia il percorso»: over the book it goes to `?rivedi=1` (since 2026-11-08 «Rifai il
  percorso» is on the book's last page), over a run still going it presses «Ricomincia il percorso». The emulators keep `allocationAdvice/test-user-1` between runs;
  a real run on that account is never cleaned by the suite. `allocation.consulente.report.spec.ts` plants its
  documents on that account and puts back the one it found, or deletes its own when there was none.
- **The path's ticks are not buttons**: the path is linear (`describeStepBlock` holds «Avanti»); the Summary's rows
  are the only jumps; the book's labels are, from `desktop:`.
- **The elapsed time is `aria-hidden`**, and the report's running view has none: the headline is the one live region,
  and a reload does not know when the stage began.
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
- **The rules are inert until they are deployed** (`npx firebase deploy --only firestore:rules`; done by the owner on 2026-10-20, the Consulente tried in production; the `history` rule of 2026-11-08 deployed by the retirement session on the owner's call — a merge deploys nothing): before the deploy
  the page does not read the document (permission-denied → the read fails and the page says so).
- **The run's E2E specs fake the route**: one `page.route` handler per spec — `e2e/consulenteInterview.ts` scripts the
  interview's rounds and records the strategy and revise bodies (a strategy answers with an error so the chain stops, a revise completes), `allocation.consulente.spec.ts` scripts its three stages and the retry
  (`doc/guide/e2e-playwright.md` § Browser-Driven E2E); no test spends, and the real run is made once per change on
  the mirror (2026-10-20 with the owner's key; the outcomes in that session's SESSION_NOTES and in the commit).
- **The interview writes nothing**: its rounds live in the draft until the strategy, and a cleared storage loses them.
- **A round abandoned** («Salta il colloquio» while it is asked, or leaving the page) **still costs its slot**; its
  late answer is ignored.
- **The revision's round lives in the book's memory**: a turn keeps it, a reload before «Rivedi il report» loses it,
  and its slot.
- **A heading the model invents lands on the previous page**, never lost, never its own page.
- **A report the reader cannot split onto two pages is one page «Il report»** after a cover with the verdict alone.
- **`?pagina=` is ignored with `rivedi=1`**, and a turn removes `rivedi`.
- **A new report opens on its cover** whatever `?pagina=` says.
- **The count-up plays on the proposal page's first mount in the session**, not on the cover.
- **Copy and the browser's find see the open page only**; the print sheet holds every page.
- **Twelve requests an hour**: a run with three rounds is four, a revision with its round two.
- **«Rifai il percorso» drops an interview the document on screen already used** (`reopenStoredDraft`): only rounds
  asked after that document's `updatedAt` survive.
- **The arrows and a swipe never turn the card** (2026-11-11): a textarea and radios live on the pages; the arrows move
  along the rail only, from `desktop:`.
- **«Rivedi con il Consulente» opens the screens, never a page of the book** (`?rivedi=1`, by design, 2026-11-11).
- **The book remembers no page across sessions**: the address is the memory (`?pagina=`), no localStorage.
- **The book changed no contract of the model** (2026-11-11): it reads the sections the strategy's and the review's
  contracts already prescribe; a heading a contract adds needs its alias in `BOOK_PAGE_TABLE`, or it lands on the page
  before.
- **A stale `?pagina=` stays in the address** when the document lost that page: the cover shows, and the next turn
  rewrites the address.
- **What was decided against** (owner, 2026-11-01): the interview never follows the report (it improves the input of
  the expensive run); the Consulente never reads the raw rows, only the aggregate block; the interview is a stage after
  the summary, never a ninth screen; nothing is written to `allocationAdvice/{uid}` before the strategy; the cashflow
  block has no income by household member.
