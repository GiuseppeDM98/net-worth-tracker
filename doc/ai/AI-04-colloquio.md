# AI-04 — The interview: the critical friend before the strategy

> Series `doc/ai/` (README.md § 5): **depends on AI-01** (retired on 2026-11-06, in develop since 2026-11-06, PR #503: The Question-Card Rule, The
> AI-Accent Rule), **AI-02** (retired on 2026-11-07, in develop since 2026-11-07, PR #505: the cashflow block the
> interview reads, the prompt builders' options object) **and AI-03** (retired on 2026-11-07, in develop since 2026-11-07, PR #507: `ChoiceList`, `PathRail`
> with its `interview` prop, `Tile`'s `generated`, the component-test harness of decision 21); **AI-06 depends on it**
> (`lib/utils/questionSet.ts`, `QuestionCard`). Written on 2026-11-01 from `develop` @ b9411a4d. Executes decisions 4,
> 6, 8 and the adopted choices A1–A6, A22. The Consulente's concept is B «La scena» (decision 74, 2026-11-06; the
> conditional of decision 37 settled); criteria 9–11 and § 4 rewritten on 2026-11-06 at AI-01's retirement (decisions
> 78, 79), to be reread there. Read adversarially on
> 2026-11-01: 35 findings applied, the decisions 21–73 in README.md § 3 (this spec: decisions 4, 6, 8, 21, 22, 23, 24,
> 33, 34, 36, 37, 38, 39, 49, 53, 54, 55, 56, 57).

## 1. The problem today (evidence on the code)

- **The path ends with a click that spends**: the Summary screen (`ConsulenteWizard.tsx:343` @ b9411a4d) calls
  `run.start(answers)`; `useConsulenteRun.start` (`components/allocation/consulente/useConsulenteRun.ts:74-107`
  @ ce26af4d) sends `{ stage: 'strategy', answers }` and then chains `instruments`, `review`. The model's first word to
  the user is the report, about five minutes later. Nothing between the eight answers and the strategy lets the model
  ask the user anything.
- **The answers are thin where the money is**: `AllocationAdviceAnswers` (`lib/utils/allocationAdviceProposal.ts:54`
  @ b9411a4d) has age, horizon, loss tolerance (3 options), exchange, broker, distribution policy, goals, roles,
  `avoid`, `notes` — no income stability, no emergency fund size, no dependants, no expected big expense, no debt plan;
  the CASHFLOW 12 MESI block (`lib/utils/cashflowBlock.ts`) shows the facts, not the user's intentions about them.
- **The run's contract is one request per stage, and every stage but the strategy needs a document**
  (`app/api/allocation-advice/run/route.ts:53-56` @ b9411a4d): `stage` ∈ `ALLOCATION_ADVICE_RUN_STAGES` ∪ `revise`,
  anything else a 400 «Fase del percorso non riconosciuta»; `answers` parsed only for `strategy` (`route.ts:57-62`
  @ ce26af4d); the rate limit counts `strategy` and `revise` (`route.ts:72` @ b9411a4d) against
  `RUN_RATE_LIMIT_MAX = 6` (`route.ts:30` @ ce26af4d). The document is created by the strategy
  (`runAllocationAdviceStage`, `run.ts:346-355` @ b9411a4d: `priorPlanOf(previous)` read BEFORE `newDocument` replaces
  it); every other stage reads the document and throws «Non trovo il percorso da continuare» without one
  (`run.ts:356-359` @ ce26af4d), and the catch WRITES the failure (`status: 'failed'`, `run.ts:371-380` @ ce26af4d). A
  stage routed through `runAllocationAdviceStage` before the strategy would fail a first-time user and turn a `ready`
  document into the failed report (`allocationAdviceDocument.ts:40-45` @ ce26af4d).
- **Structured output exists for strategy and review, at one size** (`ALLOCATION_ANSWER_FORMAT`, `run.ts:94`
  @ b9411a4d): `ModelCall` has `structured?: boolean` and no size, `callModel` sends `max_tokens:
  ALLOCATION_ADVICE_MAX_TOKENS` (32000) and, when structured, always `ALLOCATION_ANSWER_FORMAT`; its `stage` and
  `AllocationAdviceStageError.stage` are typed `AllocationAdviceStage` (`run.ts:69-78`, `:108-116`, `:124`, `:136`,
  `:139` @ ce26af4d). The SDK form is `output_config.format = { type: 'json_schema', schema }` from
  `betaZodOutputFormat(schema).schema`, and **the API keeps only part of a zod schema**: the types, the required keys,
  `minItems` 0 or 1 and `additionalProperties: false`; `maxItems`, a `minItems` of 2, every string length and every
  enum are moved into the `description` (`node_modules/@anthropic-ai/sdk/lib/transform-json-schema.js`, checked with
  `betaZodOutputFormat` on a round schema on 2026-11-01). The API writes object keys in the schema's order
  (doc/guide/consulente.md § The run).
- **The draft lives in localStorage** (`allocation-advice-draft:{ownerId}` = `{ step, goalIndex, answers }`,
  `allocationAdviceDraft.ts:186-220` @ ce26af4d): `readStoredDraft` validates `step`, `goalIndex` and `answers` by hand
  and REBUILDS the draft from those three fields (`:196-198` @ ce26af4d) — any other stored field is dropped, only the
  inside of `answers` is kept as is.
- **«Riprova» resends the answers only**: `ConsulenteRunState` carries `answers` and `resumeFrom`, and `retry` calls
  `start(state.answers, state.resumeFrom)` (`useConsulenteRun.ts:26-30`, `:110-113` @ ce26af4d).
- **No spec fakes the run route**: `e2e/allocation.consulente.spec.ts:126` @ ce26af4d asserts «Avvia la ricerca» on the
  summary and never presses it.

## 2. Goal and acceptance criteria

After the summary, the Consulente reads the answers and the data and asks the user pointed questions, in rounds,
until it is satisfied or three rounds are spent; the answers go to the strategy. Before «Chiedi una modifica» it asks
one round about the written request. Each criterion: statement · proof · the mutation that turns the proof red.

1. **The interview round is its own request and writes nothing** (A1, decision 23). The route accepts
   `{ userId, stage: 'interview', answers, interview, revision? }` (§ 4 Server) and calls `runInterviewRound`
   directly — the request never enters `runAllocationAdviceStage`. `runInterviewRound` reads the store once
   (`getAllocationAdviceAdmin`, null for a first-time user), builds the strategy's context, calls Opus 5.5 at effort
   `medium` with `interviewRoundSchema` as the structured output, and the stream carries exactly one terminal event:
   `{ type: 'interview', round }` or `{ type: 'error', error, retryable }` — no `done`, and no write to
   `allocationAdvice/{uid}` on success or on failure. Proof: `allocationAdviceRun.test.ts` — a round with `getMock`
   answering null succeeds; a round over a `ready` document calls neither `setAllocationAdviceAdmin` nor
   `patchAllocationAdviceAdmin`; a round answered with `stop_reason: 'max_tokens'` rejects with an
   `AllocationAdviceStageError` (`stage: 'interview'`, `retryable: true`) and still writes nothing;
   `allocationAdviceRoutes.test.ts` — the SSE is `[{ type: 'interview', round }]` and the `runAllocationAdviceStage`
   mock is not called. Mutation: run the interview as a branch inside `runAllocationAdviceStage` → the first-time-user
   test fails on «Non trovo il percorso», the failure test sees `patchAllocationAdviceAdmin` called.
2. **A round is 0–4 questions, read leniently.** The wire schema `interviewRoundSchema` is `{ note, satisfied,
   questions }` in that key order; each question has `id`, `kind` (`single | multiple`), `text`, `why` (required on the
   wire), 2–4 `options` and `allowOther`. The API does not enforce the counts, the lengths or the enum (§ 1), so
   `parseInterviewRound` does: questions past `QUESTION_MAX_PER_ROUND` are refused, a question failing
   `questionSchema` or repeating an earlier id is refused, an option repeating a value or using a reserved value
   (`QUESTION_DECLINE_VALUE`, `QUESTION_OTHER_VALUE`) is removed first (a question left with fewer than 2 options is
   then refused), a `note` over 600 characters is cut at 600, and `allowOther` is forced `true` (decision 54). Each
   refusal is logged `[consulente] interview question refused`; the round is null only when the text is not JSON or
   `note`/`satisfied` are missing, and a null round fails retryable with «Il modello non ha prodotto domande leggibili.
   Riprova.». Proof: `allocationAdviceProposal.test.ts` (5 questions → 4 kept and 1 refused; a 1-option question
   refused; a duplicate id refused; `allowOther: false` read as `true`; not JSON → null); `questionSet.test.ts`
   (`parseQuestionsLenient`); `allocationAdviceRun.test.ts` asserts
   `Object.keys(params.output_config.format.schema.properties)` equals `['note', 'satisfied', 'questions']`. Mutation:
   parse the round with `interviewRoundSchema.safeParse` whole → the 5-question test gets null.
3. **The client runs up to three rounds** (decision 6). Round 1 starts from «Avvia il colloquio» on the summary;
   «Continua» requests the next round with every previous round's questions and answers. `canRequestRound(interview)`
   is `!interview.skipped && (rounds.length === 0 || (rounds.length < ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS &&
   !last.satisfied && last.questions.length > 0))`. A round with `satisfied: true` AND questions shows them, and once
   they are answered the primary is «Avvia la ricerca»; a round with zero questions shows its `note` and «Avvia la
   ricerca»; the server refuses an `interview` request whose body already holds three rounds (400). Proof:
   `allocationAdviceInterview.test.ts` (`canRequestRound` at 0, 1, 2 and 3 rounds, with `satisfied`, with zero
   questions, with `skipped`); `allocationAdviceRoutes.test.ts` (three rounds → 400, no slot taken); E2E
   `allocation.consulente.interview.spec.ts`: three faked rounds, the third unsatisfied with one question, and once it
   is answered the primary reads «Avvia la ricerca». Mutation: `rounds.length <= ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS`
   → the 3-round unit test fails and the E2E sees «Continua».
4. **«Salta il colloquio» is always offered** (A3) **and commits the round as it stands**: the summary's «Salta il
   colloquio e avvia la ricerca» starts the strategy with `interview: { rounds: [], skipped: true }`; the scene's
   «Salta il colloquio» starts it with every round received, each with the answers given so far, and
   `skipped: true` — an unanswered question has no entry in `answers` and the prompt prints «non risposta»; a round
   still being requested is abandoned (criterion 14). Proof: E2E — round 1 answered, round 2 received, ONE of its two
   questions answered, «Salta il colloquio» → the recorded strategy body has `interview.rounds.length === 2`,
   `skipped: true`, `rounds[1].answers.length === 1`; a second test skips from the summary and the recorded body
   carries `{ rounds: [], skipped: true }` with no interview request recorded. Mutation: drop the last round on skip →
   `rounds.length === 2` fails.
5. **The questions and answers reach the strategy, the review and the revision, `system` unchanged.**
   `formatInterviewForPrompt(interview)` prints the header «--- IL COLLOQUIO (1 tornata) ---» or «--- IL COLLOQUIO
   (N tornate) ---», the reading-rule line, the rounds (`formatQuestionAnswersForPrompt(interview.rounds, 'Tornata')`)
   and, for a skip after rounds, «L'utente ha saltato il colloquio dopo 1 tornata.» / «… dopo N tornate.»; a skip with
   zero rounds prints only «L'utente ha saltato il colloquio.» (decision 53); `null` prints nothing. The strategy and
   the review print the block right after «--- RISPOSTE DEL PERCORSO ---», and the strategy closes it with «Tieni conto
   di queste risposte nella sezione «La situazione».» when it holds a round (AI-04-Q9); the revision prints its own
   round (criterion 13). Each builder's `system` is byte-identical with and without the option (T11). Proof:
   `allocationAdvicePrompts.test.ts` — `expect(withInterview.system).toBe(without.system)` for the three builders;
   `userContent.indexOf('--- RISPOSTE DEL PERCORSO ---') < userContent.indexOf('--- IL COLLOQUIO (2 tornate) ---')`;
   «(1 tornata)» for one round; the zero-round skip `toContain("L'utente ha saltato il colloquio.")` and
   `not.toContain('--- IL COLLOQUIO')`. Mutation: print the block before the answers → the order assertion fails;
   write «tornate» for one round → the singular assertion fails.
6. **The document persists what the strategy and the revision read**: `AllocationAdviceDocument.interview:
   AllocationAdviceInterview | null`, written by the strategy stage from the body (`newDocument` is its only writer),
   and `revisionInterview?: AllocationAdviceInterview | null`, written by `revise` with its report;
   `mapAllocationAdviceData` maps both for both SDKs (`askedAt` through `toDate`), null when absent (older documents).
   Proof: `allocationAdviceRun.test.ts` (the strategy's `setAllocationAdviceAdmin` copy carries the body's
   `interview`; the `revise` patch carries `revisionInterview`); `allocationAdviceDocument.test.ts` (a Timestamp-like
   `askedAt` becomes a Date; an older document maps to `interview: null`, `revisionInterview: null`); phase D on the
   emulator. Mutation: leave `interview` out of `newDocument` → the run test fails.
7. **The draft keeps the interview across a reload** (decision 23): `AllocationAdviceDraft` gains `phase: 'path' |
   'interview'` and `interview?: AllocationAdviceInterview`. A received round enters `rounds` at once with
   `answers: []`, and every answer is written into that last round in place — there is no separate current round — so
   the Wizard's existing effect (`writeStoredDraft`, `ConsulenteWizard.tsx:170-172` @ ce26af4d) persists it.
   `readStoredDraft` adds `phase` and `interview` to the rebuilt draft: `interview` validated with `interviewSchema`
   (a failing value dropped, the rest of the draft kept), `phase: 'interview'` kept only with at least one valid round
   (otherwise `'path'`). A reload re-renders the round without a request. Proof: `allocationAdviceDraft.test.ts` (a
   stored draft with two rounds round-trips, `askedAt` back as a Date; a malformed `interview` dropped and the answers
   kept; a draft stored before AI-04 reads `phase: 'path'` and no `interview`); E2E — after a reload on round 1 the
   scene shows the round and the handler's interview count is unchanged. Mutation: rebuild the draft without
   `interview` → the round-trip test fails.
8. **«Rifai il percorso» never prefills an interview a run already used** (A6). The document's `interview` never
   enters a draft (`initialDraft` takes the answers only), and the Wizard opens through `reopenStoredDraft(draft,
   lastDocument)`, which drops the stored draft's `interview` and sets `phase: 'path'` unless its last round's
   `askedAt` is later than `lastDocument.updatedAt` — the case of a path redone over the report and reloaded
   mid-interview, whose rounds stay. Proof: `allocationAdviceDraft.test.ts` (an interview older than a failed
   document's `updatedAt` dropped; one newer kept; one with zero rounds dropped; with no document kept). Mutation: keep
   every stored interview → the failed-document case fails.
9. **The report shows «Il colloquio»** (A6, decision 53): `ConsulenteInterviewTile({ interview })` (no hooks), a
   `Tile` WITHOUT `generated` — it recaps the user's own answers, the third exception of DESIGN.md → The AI-Accent
   Rule (decision 79, 2026-11-06) —, placed after the text tile («Il report», or «La strategia» without a report)
   and before «Chiedi una modifica». Per round a sub-eyebrow «Tornata i», the `note`, each question with its answer
   (`describeAnswer`, «non risposta» when absent, «nessuna domanda» for a round without questions); `aside` «1 tornata»
   or «N tornate», followed by « · saltato» when skipped; no tile with zero rounds or `interview: null`. Proof:
   `__tests__/consulenteInterviewTile.test.tsx` (new); `e2e/allocation.consulente.report.spec.ts` (in develop since 2026-11-07, extended
   in § 6). Mutation: render the tile for zero rounds → the empty-render assertion fails.
10. **The rail lights the interview** (the `interview` prop of `PathRail`, `components/ui/path-rail.tsx`): the Wizard passes
    `interview={{ total: 3, reached: null }}` on the eight screens (three dimmed ticks, `aria-hidden`) and
    `interview={{ total: 3, reached: N }}` on the scene, N the round shown or being asked, the reached tick and the ones before it lit in `--ai-accent` (DESIGN.md → The
    Path-Scene Rule; decision 78); the scene's eyebrow
    «Colloquio · tornata N di 3» is its only `TILE_EYEBROW_CLASS` (decision 57). Proof: E2E — on the summary
    `getByRole('list', { name: 'Il colloquio' })` has count 0; on round 2 it is visible and its second item has
    `aria-current="step"` and its tick (the item's first `span`, `aria-hidden`) the class `bg-[color:var(--ai-accent)]` —
    the item itself carries no colour (components/ui/path-rail.tsx, 2026-11-07). Mutation: pass `reached: null` on the scene → the round-2 assertion fails.
11. **`QuestionCard` obeys The Question-Card Rule** (DESIGN.md § 5 → AI Surfaces, 2026-11-06; decisions 38, 54, 55, 57):
    `components/ui/question-card.tsx`, never `bg-card` — a `rounded-xl` block wearing `AI_GENERATED_SURFACE_CLASS` (the 1px `--ai-accent` border and the
    glow on hover and `has-[:focus-visible]`, since the focus sits on a radio inside; decision 36) — and NO button inside. The eyebrow «Il Consulente chiede · i di
    n» is a `TILE_SUB_EYEBROW_CLASS` with `AI_GENERATED_EYEBROW_CLASS` (lib/constants/aiAccent.ts, 2026-11-07); then `text`, `why`, and a `ChoiceList` whose `label` is the
    question's text, single (a radio group) or multiple (a group of checkboxes). «Altro…» is on every question with
    `allowOther` (every question of the Consulente), «Preferisco non dire» is last unless `decline={false}`, and in a
    multiple question both rows are `exclusive` (choosing one deselects the others, decision 55). Rows are 44px below
    `desktop:`. The scene's footer owns the ONE primary per round (decision 38). Proof: `__tests__/questionCard.test.tsx`
    (new, React Testing Library, decision 21); `e2e/allocation.consulente.interview.mobile.spec.ts` (new). Mutation:
    render a «Rispondi» button in the card → `queryAllByRole('button')` is not empty; drop `exclusive` from «Preferisco
    non dire» → the multiple-mode assertion fails.
12. **The prompt is a critical friend**: `INTERVIEW_CONTRACT` opens with «In questa fase non proponi né consigli:
    chiedi.» (`CONSULENTE_CORE` says «proponi»: the contract overrides it for this stage, AI-04-Q6), asks only what the
    DATA or the ANSWERS make doubtful, with four example doubts, one `why` per question quoting the figure, never a
    question the answers settle, never advice; the round number is in `userContent` («Questa è la tornata N di 3.»,
    and on the third «È l'ultima: non ci sarà una quarta tornata.»). Proof: `allocationAdvicePrompts.test.ts` (the
    contract's sentences `toContain`'d; the round lines for N = 1 and N = 3; `system` byte-identical across rounds,
    users and the `revision` option); phase F, where the owner judges the questions' bite. Mutation: interpolate the
    round number into `INTERVIEW_CONTRACT` → the byte-identity across rounds fails.
13. **«Chiedi una modifica» asks one round first** (decision 24). «Rivedi il report» on the revision tile first
    requests ONE round about the written request: `{ stage: 'interview', answers: document.answers, interview:
    { rounds: [], skipped: false }, revision: { requests: <the textarea's text> } }`, same schema, same `QuestionCard`s
    inside the tile. A zero-question round sends the revise at once; with questions, «Rivedi il report» (enabled once
    every question is answered or declined) sends `{ stage: 'revise', request, interview: { rounds: [that round],
    skipped: false } }`, and «Salta le domande» sends it with `skipped: true` — or with `{ rounds: [], skipped: true }`
    while the round is still asked, aborting it. `buildRevisionPrompt` prints the round after the requests list, closed
    by «Applica l'ultima richiesta alla luce di queste risposte.»; the route refuses a `revision` request whose
    `interview` already holds a round, and a `revise` whose `interview` holds more than one (400). The tile shows
    `document.revisionInterview`'s round under the last request. Both requests take a slot. Proof:
    `allocationAdviceRoutes.test.ts` (the revision body parsed and passed on; the two 400s); `allocationAdviceRun.test.ts`
    (revision mode reads the report, sends no previous rounds, writes nothing; without a report it rejects with «Non
    c'è un report finito da rivedere. Avvia la ricerca.»; `revise` patches `revisionInterview`);
    `allocationAdvicePrompts.test.ts` (the interview's `system` byte-identical with and without `revision`; its
    `userContent` holds the report, the requests and «È l'unica tornata»); `e2e/allocation.consulente.report.spec.ts`
    (the faked round in the tile, the recorded revise body). Mutation: send the revise without `interview` → the
    recorded-body assertion fails.
14. **The wait and the abandoned round** (decision 56, AI-04-Q5): while a round is requested the scene shows the
    previous round's `note` above a skeleton of two question cards (`aria-busy="true"`, a `role="status"` line «Il
    Consulente legge le tue risposte e i tuoi dati…»), the primary and «Indietro» disabled, «Salta il colloquio»
    enabled. «Salta il colloquio» or an unmount aborts the fetch (`AbortController`) and ignores any late event; the
    slot is spent. Proof: `__tests__/useConsulenteInterview.test.tsx` (new, `renderHook`): `abort()` before the event →
    `onRound` never called and the state back to `idle`; E2E with a delayed faked round: the skeleton visible,
    «Salta il colloquio» → the recorded strategy body holds round 1 only. Mutation: drop the aborted check → `onRound`
    is called after the abort.
15. **«Riprova» on a failed strategy resends the interview**: `ConsulenteRunState`'s `running`, `failed` and `done`
    carry `interview: AllocationAdviceInterview | null`; `start(answers, from = 'strategy', interview = null)` stores
    it, `retry` passes `state.interview`, and `requestStage`'s payload gains `interview?`. Proof:
    `__tests__/useConsulenteRun.test.tsx` (new, `renderHook`): a strategy streaming a retryable error, then `retry()` →
    the second request's body carries the same `interview`. Mutation: `retry` calls `start(state.answers,
    state.resumeFrom)` → the second body has no `interview`.

## 3. Decisions

- **Decision 4** (before the strategy), **6** (as long as needed, cap 3), **8** (Opus 5.5 medium, structured), **23**
  (browser-held until the strategy, no server draft), **24** (one round before «Chiedi una modifica»), **38** (no button
  in the card, the host owns the primary), **53** (a zero-round skip has no tile; «1 tornata» / «N tornate»), **54**
  («Altro…» always), **55** (exclusive «Altro…» and «Preferisco non dire» in a multiple question), **56** (the waiting
  skeleton), **57** (one `TILE_EYEBROW`, the cards' sub-eyebrow), **21** (component tests in `.test.tsx` with React
  Testing Library, hook tests with `renderHook`), **36** (the AI accent on hover and focus-visible), **39** (the real
  key enables the controls, the route always faked), **49** as amended by **79** (no `generated` on «Il colloquio»), **33** (every gate on Node
  24), **34** (the § 11 prompt in Italian), **37** (the header's conditional), **22** (§ 10 lists only what is
  definitive).
- **A1** (client-held until the strategy), **A2** (12 an hour), **A3** (skip always), **A4** (the strategy's data plus
  the previous rounds), **A5** (16000 tokens, no web, `note` before `questions`), **A6** (the report's tile, no
  prefill), **A22** (a stage after the summary, «Passo N di 8» untouched; the locators of the eight screens stay, the
  summary's two buttons change — § 6).
- **The lead's resolutions applied**: T9 (the `QuestionCard` props, `{ entity }`, `parseQuestionsLenient(input:
  unknown)` the ONE parser), T11 (options objects; byte-identical `system` per option), AI-04-Q2 (`canRequestRound`),
  Q5 (abort), Q6 (same `CONSULENTE_CORE`), Q7 (phase D), Q9 (the strategy's instruction line), X-F08 (the repo's
  overflow guard), X-F14 (AGENTS.md rewritten in place), X-F18 (the rate-limit arithmetic).
- **«Rifai il percorso» drops the interview** (the lead's resolution of F35), implemented as `reopenStoredDraft`
  (criterion 8): it drops every interview the document on screen already used, and keeps a newer one, so a reload in
  the middle of an interview over an existing report loses nothing.
- **Adopted, reversible**: the `answers` sent with each round request are the CURRENT draft answers (the user may go
  back and change a screen between rounds; the next round and the strategy see the change; the rounds already
  answered stay as they are).
- **Adopted, reversible**: a `single` question is answered with an option's `value`, a `multiple` one with a list of
  values, «Altro…» with `{ other: text }`, «Preferisco non dire» with `QUESTION_DECLINE_VALUE` — the escape hatch that
  keeps the primary honest without a blank.
- **Adopted, reversible**: the interview is not in `useConsulenteRun`'s chain (it is not a run stage): it has its own
  hook `useConsulenteInterview` (state `idle | asking | failed`), and a failed round offers «Riprova» or «Salta il
  colloquio».
- **Adopted, reversible**: the strategy's `userContent` names unanswered questions («non risposta») so the model knows
  the silence was a skip.

## 4. Solution

### `lib/utils/questionSet.ts` (new, pure; the shared contract with AI-06)

```ts
import { z } from 'zod';

export const QUESTION_MAX_PER_ROUND = 4;
export const QUESTION_OPTIONS_MIN = 2;
export const QUESTION_OPTIONS_MAX = 4;
/** The app's own rows, never the model's: an option using either value is removed by the parser. */
export const QUESTION_DECLINE_VALUE = '__decline__';
export const QUESTION_DECLINE_LABEL = 'Preferisco non dire';
export const QUESTION_OTHER_VALUE = '__other__';
export const QUESTION_OTHER_LABEL = 'Altro…';

export const questionOptionSchema = z.object({ value: z.string().min(1).max(40), label: z.string().min(1).max(80) });
export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['single', 'multiple']),
  text: z.string().min(1).max(240),
  /** What in the data prompted it; the card prints it under the question. Required on the Consulente's wire. */
  why: z.string().min(1).max(240).optional(),
  options: z.array(questionOptionSchema).min(QUESTION_OPTIONS_MIN).max(QUESTION_OPTIONS_MAX),
  allowOther: z.boolean(),
});
export const questionSetSchema = z.array(questionSchema).max(QUESTION_MAX_PER_ROUND);
export const questionAnswerSchema = z.object({
  questionId: z.string().min(1).max(40),
  value: z.union([
    z.string().min(1).max(40), // an option's value, or QUESTION_DECLINE_VALUE
    z.array(z.string().min(1).max(40)).min(1).max(QUESTION_OPTIONS_MAX),
    z.object({ other: z.string().max(500) }), // «Altro…» as typed: blank while the user types
    z.object({ entity: z.string().max(128) }), // an id picked from `otherSelect` (AI-06)
  ]),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionAnswerValue = string | string[] | { other: string } | { entity: string } | typeof QUESTION_DECLINE_VALUE;
export type QuestionAnswer = { questionId: string; value: QuestionAnswerValue };

export function parseQuestionsLenient(input: unknown): { questions: Question[]; refused: string[] };
export function answerOf(answers: readonly QuestionAnswer[], questionId: string): QuestionAnswerValue | null;
export function withDeclineOption(question: Question): Question;
export function describeAnswer(question: Question, answer: QuestionAnswerValue, labels?: Record<string, string>): string | null;
export function formatQuestionAnswersForPrompt(rounds: ReadonlyArray<{ note: string; questions: Question[]; answers: QuestionAnswer[] }>, header: string): string;
```

- `parseQuestionsLenient(input)` takes the already-parsed list (AI-06 wraps its single block as `[obj]`): not an
  array → `{ questions: [], refused: ['not a list'] }`. It reads the items in order; from each it first removes the
  options whose `value` repeats an earlier one or equals `QUESTION_DECLINE_VALUE` / `QUESTION_OTHER_VALUE`, then
  validates with `questionSchema`; an item that fails, or repeats an earlier kept `id`, is refused; once
  `QUESTION_MAX_PER_ROUND` are kept, every further item is refused («oltre le 4 domande»). Each refusal is one string
  `domanda {index} ({id}): {reason}`.
- `withDeclineOption(question)` appends `{ value: QUESTION_DECLINE_VALUE, label: QUESTION_DECLINE_LABEL }` as the last
  option unless it is there; its result is for display (it may hold `QUESTION_OPTIONS_MAX + 1` options) and is never
  validated again.
- `describeAnswer` is the ONE describer of an answer, for the prompt, the tile and AI-06's message: it tests
  `QUESTION_DECLINE_VALUE` FIRST (the literal is absorbed by `string` in the type) → `QUESTION_DECLINE_LABEL`; a string
  → its option's `label` (the raw value when the option is unknown); a list → the labels joined by «, »; `{ other }` →
  «Altro: {text trimmed}»; `{ entity }` → `labels?.[entity] ?? entity`; a blank `{ other }` or `{ entity }` → `null`
  (no answer yet). Every caller treats `null` as unanswered.
- `formatQuestionAnswersForPrompt(rounds, header)`: per round i one line `{header} {i+1} — nota del Consulente:
  «{note}»`, then one line per question `- {text} (perché: {why}) → {describeAnswer ?? 'non risposta'}` (the
  parenthesis only with a `why`), and `- nessuna domanda` for a round without questions.

### The wire and stored shapes (`lib/utils/allocationAdviceProposal.ts`, beside the answers schema)

```ts
/** The round on the wire (`output_config.format`): `note` first, so the model reads before it asks. */
export const interviewRoundSchema = z.object({
  note: z.string().min(1).max(600),
  satisfied: z.boolean(),
  questions: z.array(questionSchema.extend({ why: z.string().min(1).max(240) })).max(QUESTION_MAX_PER_ROUND),
});
export function parseInterviewRound(text: string): { round: { note: string; satisfied: boolean; questions: Question[] } | null; refused: string[] };

/** A round as the request body, the draft and the document hold it. */
export const interviewRoundStoredSchema = z.object({
  note: z.string().max(600),
  satisfied: z.boolean(),
  questions: questionSetSchema,
  answers: z.array(questionAnswerSchema).max(QUESTION_MAX_PER_ROUND),
  model: z.string().min(1).max(80),
  askedAt: z.coerce.date(),
});
export const interviewSchema = z.object({
  rounds: z.array(interviewRoundStoredSchema).max(ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS),
  skipped: z.boolean(),
});
export type AllocationAdviceInterviewRound = z.infer<typeof interviewRoundStoredSchema>;
export type AllocationAdviceInterview = z.infer<typeof interviewSchema>;
```

`parseInterviewRound(text)` (the `parseInstrumentCandidatesLenient` pattern): `JSON.parse`; null when the text is not
JSON, `note` is not a non-empty string or `satisfied` not a boolean; the `note` trimmed and cut at 600 characters (the
cut named in `refused`); `questions` through `parseQuestionsLenient`, then `allowOther: true` on every kept question.

### Types (`types/allocationAdvice.ts`)

```ts
/** The interview's cap (decision 6): three rounds, then the strategy. */
export const ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS = 3;
export type { AllocationAdviceInterview, AllocationAdviceInterviewRound } from '@/lib/utils/allocationAdviceProposal';
// AllocationAdviceRunStage and ALLOCATION_ADVICE_RUN_STAGES are UNCHANGED: the route accepts `stage: 'interview'` as a
// branch of its own that never enters runAllocationAdviceStage.

export interface AllocationAdviceDocument {
  // … every field of today, plus:
  /** The path's interview, from the strategy's body; null when absent (older documents, an older client). */
  interview: AllocationAdviceInterview | null;
  /** The round asked before the last «Chiedi una modifica», from the revise's body. */
  revisionInterview?: AllocationAdviceInterview | null;
}

export type AllocationAdviceRunEvent =
  | { type: 'stage'; stage: AllocationAdviceStage }
  | { type: 'interview'; round: Omit<AllocationAdviceInterviewRound, 'answers'> }
  | { type: 'done'; document: AllocationAdviceDocument }
  | { type: 'error'; error: string; retryable?: boolean };
```

The interview types are inferred from the schema and re-exported here, the file's pattern
(`types/allocationAdvice.ts:14-20` @ ce26af4d). The cap lives here and not in `run.ts`: `interviewSchema`, the pure
interview module and the Wizard read it, and `run.ts` is `server-only`; `allocationAdviceProposal.ts` imports the value
from here, and this file imports from it types only (no runtime cycle). On the wire `round.askedAt` is an ISO string:
the client reads every event's round through `interviewRoundStoredSchema.safeParse({ ...event.round, answers: [] })`.

### Server

- `lib/server/allocationAdvice/prompts.ts`:
  - `INTERVIEW_CONTRACT` (exported; verbatim below, read with the owner in phase B) and
    `buildInterviewPrompt(answers, dataBlock, opts: { cashflowBlock: string; priorPlan: AllocationAdvicePriorPlan | null;
    previousRounds: AllocationAdviceInterviewRound[]; roundNumber: number; revision?: { requests: string; report: string }
    | null })` → `{ system: `${CONSULENTE_CORE}\n${INTERVIEW_CONTRACT}`, userContent }`. `userContent`, in order:
    `formatAnswersForPrompt(answers)`; the strategy's data intro sentence for a run WITH the block (today the first
    branch of `exhaustive` in `buildStrategyPrompt`, extracted as a module constant `DATA_INTRO`, shared by the two
    builders so they never drift); `dataBlock`; `opts.cashflowBlock` under its note, as the strategy prints it
    (`formatCashflowBlockSection(cashflowBlock).slice(0, 2)`, decision 81);
    `formatPriorPlanForPrompt(opts.priorPlan)` when given; with previous rounds «--- LE TORNATE PRECEDENTI ---» and
    `formatQuestionAnswersForPrompt(opts.previousRounds, 'Tornata')`; with `revision` «--- IL REPORT DA RIVEDERE ---»
    with `revision.report`, «--- LE RICHIESTE DELL'UTENTE, in ordine (l'ultima è quella nuova) ---» with
    `revision.requests`, then «Questa tornata riguarda SOLO l'ultima richiesta di modifica: chiedi cosa intende, cosa
    accetta di cedere e cosa non va toccato, se i dati o il report lo rendono dubbio. È l'unica tornata: non ce ne sarà
    un'altra.»; without `revision` «Questa è la tornata {roundNumber} di 3.», plus «È l'ultima: non ci sarà una quarta
    tornata.» when `roundNumber === ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS`; last «Leggi risposte e dati e scrivi la
    tornata come descritto nel contratto.».
  - `formatInterviewForPrompt(interview)`: zero rounds and `skipped` → only «L'utente ha saltato il colloquio.»; zero
    rounds and not skipped → `''`; otherwise the header «--- IL COLLOQUIO ({describeRoundCount(n)}) ---», the reading
    rule «Risposte al colloquio: «Preferisco non dire» è una scelta dell'utente, da rispettare senza dedurne nulla;
    «non risposta» vuol dire che ha saltato il colloquio prima di rispondere.», the rounds
    (`formatQuestionAnswersForPrompt(interview.rounds, 'Tornata')`), and when skipped «L'utente ha saltato il
    colloquio dopo {describeRoundCount(n)}.».
  - The prompt builders' options objects gain `interview`: `buildStrategyPrompt(answers, dataBlock, opts?: { priorPlan?;
    cashflowBlock?; interview?: AllocationAdviceInterview | null })` prints the block right after
    `formatAnswersForPrompt(answers)`, closed by «Tieni conto di queste risposte nella sezione «La situazione».» when
    it holds a round; `buildReviewPrompt(answers, strategyMarkdown, instrumentsMarkdown, candidates, opts?:
    { interview?: AllocationAdviceInterview | null })` prints it at the same place, without the closing line;
    `buildRevisionPrompt(answers, strategyMarkdown, instrumentsMarkdown, candidates, previousReport, requests, opts?:
    { interview?: AllocationAdviceInterview | null })` takes the REVISION's round and, when it holds a round, prints
    after the requests list «Prima di questa revisione il Consulente ha fatto una tornata di domande sull'ultima
    richiesta:», the block and «Applica l'ultima richiesta alla luce di queste risposte.».

```
# In questa fase
In questa fase non proponi né consigli: chiedi.
Hai davanti le risposte del percorso e i dati dell'intero portafoglio e del cashflow. Fai da amico critico: chiedi SOLO ciò che i dati o le risposte rendono dubbio e che cambierebbe la strategia. Esempi del genere di dubbio: un reddito concentrato su una sola fonte con un orizzonte lungo e una tolleranza alle perdite alta; un obiettivo entro pochi anni con molte azioni; una riserva di emergenza che i conti liquidi non coprono; una rata di prestito accanto a «niente da evitare».
Non chiedere ciò che le risposte dicono già. Non dare consigli, non proporre allocazioni, non giudicare il mercato.

# Cosa devi produrre
La risposta è UN oggetto JSON con tre campi, in quest'ordine: `note`, `satisfied`, `questions`.
- `note`: 1-2 frasi, scritte PRIMA delle domande: cosa vedi nei dati e nelle risposte.
- `satisfied`: true quando nessun dubbio resta aperto; allora `questions` può essere vuota.
- `questions`: da 0 a 4 domande; quelle oltre la quarta vengono scartate. Ognuna ha `id` (breve, unico nella tornata), `kind` ("single" se la risposta è una, "multiple" se possono essere più), `text` (la domanda, in seconda persona), `why` (una riga: il numero o la risposta che l'ha fatta nascere, citato — es. «la tua unica fonte di reddito copre l'86% delle entrate»), `options` (da 2 a 4 opzioni concrete, con i numeri quando i dati li danno: `value` breve e unico nella domanda, `label` leggibile; una domanda con meno di 2 opzioni viene scartata) e `allowOther`: sempre true.
- Non mettere fra le opzioni «Altro» né «Preferisco non dire»: l'app li aggiunge a ogni domanda. «Preferisco non dire» è una scelta dell'utente da rispettare.
- Le tornate sono al massimo tre e il numero della tornata è scritto alla fine dei dati. Dopo la terza non ce n'è una quarta: se qualcosa resta aperto, dillo nella `note`.
```

- `lib/server/allocationAdvice/run.ts`:
  - `ModelCall` gains `maxTokens?: number` (default `ALLOCATION_ADVICE_MAX_TOKENS`), and `structured?: boolean` is
    replaced by `format?: { type: 'json_schema'; schema: Record<string, unknown> }`: the strategy, the review and the
    revision pass `format: ALLOCATION_ANSWER_FORMAT`. `callModel`'s first parameter, `assertFinished`'s and
    `AllocationAdviceStageError.stage` are typed `AllocationAdviceStage | 'interview'`; `AllocationAdviceStage` itself
    is unchanged, and `runAllocationAdviceStage`'s catch patches `stage: failure.stage === 'interview' ?
    documentStageOf(stage) : failure.stage` (never 'interview' there; the narrowing is for the type).
  - `ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS = 16000`; `INTERVIEW_FORMAT = { type: 'json_schema' as const, schema:
    betaZodOutputFormat(interviewRoundSchema).schema }` (module-local, like `ALLOCATION_ANSWER_FORMAT`).
  - A module-local `buildConsulenteContext(userId, now): Promise<{ dataBlock: string; cashflowBlock: string }>` —
    the two reads in ONE `Promise.all([buildAssistantYtdContext(userId), readCashflowBlockForPrompt(userId, now)])`
    (`runStrategy` does the same pair inline today, through `fetchCashflowBlockInputs`: this spec extracts it into the
    helper), then `formatBundleForPrompt(bundle)` — used by
    `runStrategy` and `runInterviewRound`, so the interview reads exactly the strategy's data (A4). A failed read rejects, and the route
    streams its generic retryable error (a failed read is never a silent zero, doc/guide/consulente.md § The run).
  - `export async function runInterviewRound(args: RunInterviewRoundArgs): Promise<void>` with
    `RunInterviewRoundArgs = { userId: string; answers: AllocationAdviceAnswers; previousRounds:
    AllocationAdviceInterviewRound[]; revision?: { requests: string } | null; onRound: (round:
    Omit<AllocationAdviceInterviewRound, 'answers'>) => void; now?: Date }`: (1) `const stored = await
    getAllocationAdviceAdmin(userId)` — its ONLY store call; (2) with `revision`, a `stored` without `report` or
    `strategy?.proposal` rejects with `AllocationAdviceStageError('interview', "Non c'è un report finito da rivedere.
    Avvia la ricerca.")`; (3) `buildConsulenteContext`; (4) `buildInterviewPrompt(answers, dataBlock, { cashflowBlock,
    priorPlan: revision ? null : priorPlanOf(stored), previousRounds, roundNumber: previousRounds.length + 1, revision:
    revision ? { requests, report } : null })`, `requests` the stored requests plus the new one, numbered as
    `buildRevisionPrompt` numbers them, `report` = `withBlock(report.markdown, ALLOCATION_PROPOSAL_BLOCK,
    report.proposal)`; (5) `callModel('interview', { model: ALLOCATION_ADVICE_STRATEGY_MODEL, effort:
    ALLOCATION_ADVICE_STRATEGY_EFFORT, maxTokens: ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS, format: INTERVIEW_FORMAT,
    prompt })` — no `webSearch`; (6) `parseInterviewRound(answer.text)`, the refused logged, a null round rejects
    retryable with «Il modello non ha prodotto domande leggibili. Riprova.»; (7) `onRound({ ...round, model:
    answer.model, askedAt: new Date() })`. It never calls `setAllocationAdviceAdmin`, `patchAllocationAdviceAdmin` or
    `enterStage`.
  - `RunAllocationAdviceStageArgs` gains `interview?: AllocationAdviceInterview | null`: the strategy writes it into
    the new document (`newDocument(userId, answers, now, interview)` sets `interview: interview ?? null`,
    `revisionInterview: null`); `runStrategy(document, onStage, priorPlan, now)` passes `{ priorPlan, cashflowBlock,
    interview: document.interview }`; `runReview` passes `{ interview: document.interview }`; `runRevise(document,
    request, interview, onStage)` passes `{ interview }` and patches `revisionInterview: interview ?? null` with the
    report.
  - `lib/constants/aiModels.ts`: no new constant; the comment over `ALLOCATION_ADVICE_STRATEGY_MODEL` names the
    interview beside the strategy and the review.
- `app/api/allocation-advice/run/route.ts`:
  - The body type gains `interview?: unknown; revision?: unknown`; the stage parser adds `body.stage === 'interview' ?
    'interview'` beside `'revise'` (its type `AllocationAdviceRunStage | 'interview' | null`).
  - `answers` parsed with `allocationAdviceAnswersSchema` for `strategy` AND `interview`. `interview` parsed with
    `interviewSchema`: required for `interview` (`{ rounds: [], skipped: false }` asks round 1), optional for
    `strategy` and `revise` (absent → `null`). `revision` (interview only, optional) parsed with `z.object({ requests:
    revisionRequestSchema })`.
  - 400 before any slot: an `interview` request with `skipped: true` («Il colloquio è stato saltato.»), with
    `rounds.length >= ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS` («Il colloquio ha già tre tornate: avvia la ricerca.»),
    with `revision` and `rounds.length > 0`, or a `revise` whose `interview.rounds.length > 1` («Prima della revisione
    c'è una sola tornata di domande.»).
  - The rate limit counts `strategy`, `revise` and `interview`: `RUN_RATE_LIMIT_MAX = 12`, «12 model requests an hour
    per warm instance (interview rounds, strategy, revise; instruments and review do not count)»; the 429's sentence
    becomes «Hai fatto troppe richieste al Consulente in un'ora. Riprova più tardi.».
  - `stage === 'interview'` streams from `runInterviewRound({ userId, answers, previousRounds: interview.rounds,
    revision, onRound: (round) => controller.enqueue(encodeEvent({ type: 'interview', round })) })`; its failures go
    through today's `error` branch. Every other stage calls `runAllocationAdviceStage` as today, with `interview`
    (strategy, revise). The log line adds `rounds: interview?.rounds.length ?? null`; the route's doc comment names
    the new body fields.

### Client

- `lib/utils/allocationAdviceInterview.ts` (new, pure): `EMPTY_INTERVIEW = { rounds: [], skipped: false }`;
  `interviewReducer(interview, action)` with `InterviewAction = { type: 'roundReceived'; round:
  AllocationAdviceInterviewRound } | { type: 'answer'; questionId: string; value: QuestionAnswerValue | null } |
  { type: 'skip' } | { type: 'reset' }` — `roundReceived` appends with `answers: []`; `answer` writes into the LAST
  round only, replacing that question's entry, and `null` or `[]` removes it; `skip` sets `skipped: true` and keeps
  the rounds as they stand; `reset` returns `EMPTY_INTERVIEW`. `canRequestRound(interview)` (criterion 3);
  `describeInterviewBlock(interview)` → the first question of the last round whose `describeAnswer` is null: «Rispondi
  a «{text}», o scegli «Preferisco non dire».», else null; `describeRoundCount(n)` → «1 tornata» | «{n} tornate» (the
  ONE singular/plural rule, read by `formatInterviewForPrompt` and the tile).
- `lib/utils/allocationAdviceNarrative.ts`: `INTERVIEW_COPY` (every label of the scene, the summary and the revision
  tile quoted in this spec) and `describeInterviewAside(interview)` → «2 tornate», «2 tornate · saltato», or null with
  zero rounds.
- `lib/utils/allocationAdviceDraft.ts`: `AllocationAdviceDraft` gains `phase: 'path' | 'interview'` and
  `interview?: AllocationAdviceInterview`; `initialDraft` sets `phase: 'path'`; `AllocationAdviceDraftAction` gains
  `{ type: 'phase'; phase: 'path' | 'interview' }` (`'interview'` sets `interview` to `{ rounds: interview?.rounds ??
  [], skipped: false }`) and `{ type: 'interview'; action: InterviewAction }` (delegates to `interviewReducer`);
  `readStoredDraft` per criterion 7; `reopenStoredDraft(draft: AllocationAdviceDraft | null, lastDocument:
  AllocationAdviceDocument | null): AllocationAdviceDraft | null` per criterion 8. The Wizard's initialiser becomes
  `reconcileDraftGoals(reopenStoredDraft(readStoredDraft(storage, ownerId), lastDocument) ?? initialDraft(…),
  goalData)`.
- `lib/utils/allocationAdviceDocument.ts`: `mapAllocationAdviceData` maps `interview` and `revisionInterview` (each
  round's `askedAt` through `toDate`, the rest as stored), null when absent. `priorPlanOf` is unchanged.
- `components/allocation/consulente/useConsulenteInterview.ts` (new): state `{ kind: 'idle' } | { kind: 'asking' } |
  { kind: 'failed'; error: string; retryable: boolean }`; `requestRound(payload: { answers; interview; revision?:
  { requests: string } | null }, onRound: (round: AllocationAdviceInterviewRound) => void)` — one `AbortController`
  per request in a ref, `authenticatedFetch(…, { signal })`, `forEachSseEvent`: `interview` → the round through
  `interviewRoundStoredSchema` (a failing round is «Il Consulente ha risposto in una forma che non leggo. Riprova.»),
  `error` → `failed`, a stream that ends with neither → «La tornata si è interrotta prima della fine. Riprova.»;
  `abort()` aborts, sets `idle`, and every later event or rejection of that request is ignored
  (`signal.aborted` checked first); an effect's cleanup calls `abort()` on unmount; a second `requestRound` while one
  is in flight is ignored. Promise chains as in `useConsulenteRun` (no `try … finally` in a hook body).
- `components/allocation/consulente/useConsulenteRun.ts`: criterion 15; the strategy payload is `{ stage, answers,
  interview }`.
- `components/allocation/consulente/useConsulenteRevision.ts`: `revise(request, interview: AllocationAdviceInterview |
  null, onDone)` sends `{ stage: 'revise', request, interview }`.
- `components/ui/question-card.tsx` (new): `QuestionCard(props: { question: Question; index: number; total: number;
  answer: QuestionAnswerValue | null; onAnswer: (value: QuestionAnswerValue) => void; eyebrow?: string; decline?:
  boolean /* default true */; otherSelect?: { label: string; items: readonly { id: string; name: string }[] } }):
  React.JSX.Element`. It renders, inside a `rounded-xl` block (`AI_GENERATED_SURFACE_CLASS` of `lib/constants/aiAccent.ts`: the 1px accent border, the glow on hover and
  `has-[:focus-visible]` — The AI-Accent Rule; `p-4 desktop:p-5`): the eyebrow (`eyebrow ?? «Il Consulente chiede ·
  {index} di {total}»`, `TILE_SUB_EYEBROW_CLASS` with `AI_GENERATED_EYEBROW_CLASS`), `text` (16px below `desktop:` and 20px from it, weight 500 — The Question-Card Rule), `why` (13px
  muted) and a `ChoiceList` with `name` from `useId()` plus `question.id`, `label = question.text`, `mode =
  question.kind`, and `options` = `withDeclineOption(question).options` (only when `decline`) with the «Altro…» row
  (`QUESTION_OTHER_VALUE`, only with `allowOther`) inserted before «Preferisco non dire»; both reserved rows carry
  `exclusive: true`. The answer maps onto the list's value: `QUESTION_DECLINE_VALUE` → that row; `{ other }` and
  `{ entity }` → the «Altro…» row; a list in multiple mode as is. A change maps back: the decline row →
  `QUESTION_DECLINE_VALUE`, the «Altro…» row → `{ other: '' }` (`{ entity: '' }` with `otherSelect`), options → the
  value or the list. Without `otherSelect`, `ChoiceList`'s `other` is `{ value: QUESTION_OTHER_VALUE, label: «Altro —
  {text}», text: the `other` of an `{ other }` answer, else `''` (the prop is a required string), onTextChange: (text) => onAnswer({ other: text.slice(0, 500) }) }`; with `otherSelect`
  the card renders, under the list while «Altro…» is chosen, a labelled `Select` (`aria-label={otherSelect.label}`) of
  `otherSelect.items` answering `{ entity: id }`. No button, no `bg-card`.
- `components/allocation/consulente/ConsulenteInterviewScene.tsx` (new): the scene, rendered by the Wizard when
  `draft.step` is the summary and `draft.phase === 'interview'`, inside the path's card (the Wizard's `section` of
  `TILE_SURFACE_CLASS` + `SCENE_CARD_CLASS`, 720px, the second column of the `SCENE_GRID_CLASS` grid at `desktop:`)
  (the cards stack `gap-4` in it, no card within a card) as one more scene of the Wizard's (`data-scene="interview"`, the
  enter from the summary and the exit back to it as the path's screens (`sceneVariants`); a new round replaces the cards inside the same
  scene, the cards entering with `cardEnterVariants` of `lib/utils/motionVariants.ts`, the motion table's «Question card, entering»). The rail is the grid's sibling column beside the card, never inside it, lit by criterion 10 (2026-11-07). Top to bottom in the card: the eyebrow
  «Colloquio · tornata N di 3»; the headline = the last round's `note` («Il Consulente legge le tue risposte e i tuoi
  dati.» before round 1 arrives); while asking the skeleton (criterion 14); otherwise the last round's
  `QuestionCard`s, keyed by `question.id`; the footer: «Indietro» (→ `{ type: 'phase', phase: 'path' }`, the summary,
  the rounds kept; disabled while asking), the secondary «Salta il colloquio», the primary «Continua» while
  `canRequestRound`, «Avvia la ricerca» otherwise, «Riprova» after a failed round, disabled while
  `describeInterviewBlock` speaks (its sentence in the footer's `role="status"`) or a round is asked. The controls
  that call the model — «Continua», «Avvia la ricerca», «Riprova» — take the AI accent on hover and focus-visible
  (`AI_CONTROL_ACCENT_CLASS` beside `border border-transparent`, the filled control's border width: decision 85)
  only (decision 36); «Salta il colloquio» never, though it starts the strategy (DESIGN.md → The AI-Accent Rule's
  «Never accented»; decision 78).
- `ConsulenteWizard.tsx`: the summary's footer — with no round, the primary «Avvia il colloquio» (dispatches
  `{ type: 'phase', phase: 'interview' }` and requests round 1 from the click) and the secondary «Salta il colloquio e
  avvia la ricerca» (`run.start(answers, 'strategy', { rounds: [], skipped: true })`); with rounds, the primary «Torna
  al colloquio» (the scene, no request) and the secondary «Ricomincia il colloquio» (`{ type: 'interview', action:
  { type: 'reset' } }`); all four disabled without the key, the primary reading «Servizio AI non configurato».
  «Avvia il colloquio» takes the hover accent (decision 36; `AI_CONTROL_ACCENT_CLASS` + `border border-transparent`, decision 85); «Salta il colloquio e avvia la ricerca» does not (decision 78). «Continua»
  requests `{ answers, interview: draft.interview }` and dispatches the received round; «Salta il colloquio» calls
  `abort()`, dispatches `{ type: 'interview', action: { type: 'skip' } }` and starts `run.start(answers, 'strategy',
  interviewReducer(interview, { type: 'skip' }))`; «Avvia la ricerca» starts `run.start(answers, 'strategy',
  draft.interview)`.
- `components/allocation/consulente/ConsulenteInterviewTile.tsx` (new): criterion 9.
- `components/allocation/consulente/ConsulenteRevisionTile.tsx` (new): today's «Chiedi una modifica» tile moved out of
  `ConsulenteReport.tsx:312-336` @ ce26af4d, handed the report's `revision` (the report keeps
  `useConsulenteRevision`, whose `revising` disables «Applica» as today) and the document; it owns the request text and
  `useConsulenteInterview` for criterion 13: «Rivedi il report» → the round (the textarea read-only, the skeleton,
  «Salta le domande» enabled) → the `QuestionCard`s under the round's `note` and «Rivedi il report» again; under the
  last request of the list, `document.revisionInterview`'s round (a sub-eyebrow «Il Consulente ha chiesto» in the AI
  accent, each question with its answer). «Rivedi il report» and «Riprova» take the hover accent; «Salta le domande» does not (decision 78).
- `ConsulenteReport.tsx`: `ConsulenteInterviewTile` placed per criterion 9; `ConsulenteRevisionTile` in place of the
  inline tile.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **A1 / `priorPlanOf` read before replace** — here it means the interview request never enters
  `runAllocationAdviceStage` and never calls `setAllocationAdviceAdmin` or `patchAllocationAdviceAdmin`; criterion 1's
  tests are the guard, its failure path included.
- **The silent-cap rule** — here it means the caps (0–4 questions, 2–4 options, three rounds) are written in
  `INTERVIEW_CONTRACT` and the round number in `userContent`, and what the parser drops is logged.
- **The API keeps part of the schema** (§ 1) — here it means every count, length and enum is enforced by
  `parseInterviewRound` / `parseQuestionsLenient`; `why` is required only on the wire (`questionSchema.extend`), the
  shared `questionSchema` keeps it optional for AI-06.
- **`system` byte-identical** — the rounds, the answers, the round number, the revision's report and requests ride in
  `userContent`; every builder's `system` is compared with `toBe` across options.
- **Structured output and `pause_turn`** — no web search in the interview (`callModel` without `webSearch`); the
  continuation loop is untouched.
- **Opus 5.5 refuses a forced `tool_choice`** — not used; the structured output is `output_config.format`.
- **A request that spends belongs to the click** (the lesson in `useConsulenteRun.ts`) — a round is requested from
  «Avvia il colloquio», «Continua», «Riprova» and «Rivedi il report», never from an effect; the only effect aborts on
  unmount.
- **AGENTS.md § Accessibility** — touch targets ≥ 44px (the rows, the footer's buttons, the `Select`); each
  `ChoiceList` inside a `QuestionCard` takes the question's text as its `label` (the group's accessible name); the
  round's blocking sentence is the footer's `role="status"`; the skeleton carries `aria-busy="true"`.
- **AGENTS.md § React Compiler and the hooks rules** — the reducers are pure; no `try … finally` and no `throw`
  inside a `try` in a component or hook (promise chains); the card list keyed by `question.id` (unique by the parser);
  the `ChoiceList` name from `useId()`, so two cards never share a radio group.
- **`askedAt` crosses JSON** (SSE, localStorage, the request body) — every reader parses a round with
  `interviewRoundStoredSchema` (`z.coerce.date()`), never trusts the event's type.
- **The decline literal is absorbed by `string`** — every reader tests `QUESTION_DECLINE_VALUE` before reading a string
  as an option value (`describeAnswer` does it once).
- **A blank «Altro…» is stored, not answered** — `{ other: '' }` keeps the row chosen while the user types; it is a
  valid stored value, `describeAnswer` returns null for it, it blocks the primary and prints «non risposta». An empty
  list removes the entry (an empty list is no answer and would fail `questionAnswerSchema`).
- **Documents built in tests gain `interview: null`** — `interview` is a required field; `tsc` names every fixture.
- **The revision reads the revision's round only** — `buildRevisionPrompt`'s `interview` is the round asked before the
  request; the path's interview reaches the revision through the strategy and the previous report it already carries.
- **The rate limit is per warm instance** — 12 requests: a run with three rounds is four (three runs an hour), a
  revision with its round two; a 429 on a round shows the route's sentence in the scene's `role="status"`, and
  «Salta il colloquio» still starts the strategy, which takes a slot too.
- **A shared-account viewer** — as the strategy: `assertCanAccessAccount`, the rate limit keyed by `ownerId`, the draft
  keyed by `ownerId` on this browser.
- **Reduced motion** — the cards enter per the motion table of DESIGN.md § 5 → AI Surfaces: no translate under reduced motion, the card appears.
- **E2E: a probe never spends** (decision 39) — `/api/allocation-advice/run` is faked in every spec with ONE
  `page.route` handler that reads `request.postDataJSON().stage`: `interview` answers the scripted round
  (`data: {"type":"interview","round":…}`), `strategy` and `revise` record the body and answer `{ type: 'error',
  error: 'Corsa finta: la strategia non parte nei test.', retryable: false }`, so no `instruments` or `review` request
  is made; the real key of `.env.local` only enables the controls.
- **No owner data** — the faked rounds and the planted documents use invented figures («l'86% delle entrate»), the
  decoys «fenicottero» and «ornitorinco».
- **Cases that do not change**: the demo (the page shows its `EmptyState` and never reaches the Wizard); a server
  without the key (the route's 503 for every stage, the interview included); `priorPlanOf` (a new run reads the old
  report, not the old interview); the instrument search's prompt (it reads the proposal's sleeves); the `applied`
  route; `ALLOCATION_ADVICE_RUN_STAGES`, `AllocationAdviceRunStage` and «Passo N di 8»; the mobile composition (none:
  The Conversation-Is-Content Rule); the tablet (the same 720px column, covered by the 390 and 1440 specs, no tablet
  spec).

## 6. Tests per level (with the mutation that proves each)

- `__tests__/questionSet.test.ts` (new): the schema bounds (5 questions refused by `questionSetSchema`; 1 option
  refused; `questionAnswerSchema` refuses `{ other }` of 501 characters and accepts a blank one and `{ entity }`);
  `parseQuestionsLenient` (5 → 4 kept, 1 refused; a duplicate id refused; a duplicate option value and a
  `__decline__` / `__other__` value removed, a question left with one option refused; a non-list → empty);
  `withDeclineOption` idempotent and last; `describeAnswer` for the five shapes plus a blank `{ other }` → null;
  `formatQuestionAnswersForPrompt` prints «non risposta», «Preferisco non dire», «nessuna domanda». Mutations:
  `QUESTION_MAX_PER_ROUND = 5` → the bound test fails; the decline appended twice → idempotence fails; the duplicate-id
  check removed → its test fails.
- `__tests__/allocationAdviceInterview.test.ts` (new): `interviewReducer` (append, answer in the last round only,
  replace, `[]`/null removes, skip keeps the rounds, reset); `canRequestRound` (criterion 3's cases);
  `describeInterviewBlock` (a half-answered round names the first unanswered question; a blank «Altro…» blocks; a
  decline passes); `describeRoundCount(1)` «1 tornata», `(2)` «2 tornate». Mutation: `<=` in `canRequestRound` → the
  3-round case fails.
- `__tests__/allocationAdviceProposal.test.ts`: `parseInterviewRound` (criterion 2's cases, the note cut at 600);
  `interviewSchema` (4 rounds refused; an ISO `askedAt` read as a Date; `{ other }` of 501 characters refused).
  Mutation: whole-round `safeParse` → the 5-question case gets null.
- `__tests__/allocationAdvicePrompts.test.ts`: `buildInterviewPrompt` (`system` = `CONSULENTE_CORE` +
  `INTERVIEW_CONTRACT`, `toBe` across two users, across `roundNumber` 1 and 3, with and without `previousRounds`,
  `priorPlan` and `revision`; the contract's sentences, among them «In questa fase non proponi né consigli: chiedi.»;
  the round lines; the revision's lines and `not.toContain('Questa è la tornata')`); criterion 5's assertions for
  `buildStrategyPrompt`, `buildReviewPrompt`, `buildRevisionPrompt` (the closing lines present only with a round).
  Mutations: the block before the answers → the order fails; the round number in the contract → the `toBe` fails.
- `__tests__/allocationAdviceRun.test.ts`: the mock of `@/lib/services/assistantMonthContextService` serves
  `fetchCashflowBlockInputs` (as it does since 2026-11-07); `runInterviewRound` makes ONE call with `model ===
  ALLOCATION_ADVICE_STRATEGY_MODEL`, `output_config.effort === ALLOCATION_ADVICE_STRATEGY_EFFORT`, `max_tokens ===
  ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS`, the format's keys `['note', 'satisfied', 'questions']`, no `tools`;
  `onRound` once, with the answering model, a Date `askedAt`, `allowOther: true`; `getMock` once, `setMock` and
  `patchMock` never; the first-time user, the `max_tokens` failure, the unreadable round, the revision mode and its
  missing report (criteria 1, 2, 13); the strategy's first write carries `interview`, the review's prompt carries the
  block, the revise patch carries `revisionInterview`. Mutation: a `setAllocationAdviceAdmin` call in
  `runInterviewRound` → the no-write assertion fails.
- `__tests__/allocationAdviceRoutes.test.ts`: the run module's mock adds `runInterviewRound: interviewMock`; an
  interview request streams `[{ type: 'interview', round }]`, calls `interviewMock` with `{ userId: 'user-1',
  answers, previousRounds: [], revision: null }` and not `runMock`; without `answers` → 400 and `rateLimitMock` not
  called; criterion 3's and 13's 400s; `checkRateLimit` called with `('user-1:allocation-advice', 12, 3600000)` for
  `interview`, `strategy` and `revise` (the two existing tests' `toHaveBeenCalledTimes(1)` become this
  `toHaveBeenCalledWith`), never for `instruments`; `rateLimitMock.mockReturnValueOnce({ allowed: false,
  retryAfterSeconds: 60 })` → an interview request answers 429 with `Retry-After: 60` and `interviewMock` is not
  called; the strategy and the revise pass `interview` on (null when absent). Mutations: drop `stage ===
  'interview'` from the rate-limit condition, or keep `RUN_RATE_LIMIT_MAX = 6` → the call-arguments assertion fails.
- `__tests__/allocationAdviceDocument.test.ts`: criterion 6's mapping. `__tests__/allocationAdviceDraft.test.ts`:
  criteria 7 and 8, and the draft reducer's two new actions delegating to `interviewReducer`.
- `__tests__/questionCard.test.tsx` (new, React Testing Library: `render`, `screen`, `userEvent`): the eyebrow «Il
  Consulente chiede · 2 di 3», the text and the why; `getByRole('radiogroup', { name: question.text })` for single,
  `getByRole('group', { name: question.text })` for multiple; «Preferisco non dire» present, absent with
  `decline={false}`; clicking «Altro…» calls `onAnswer({ other: '' })`, and with `answer={{ other: 'x' }}` the input
  named «Altro — {text}» shows and typing calls `onAnswer({ other: 'xy' })`; in multiple mode «Preferisco non dire»
  calls `onAnswer(QUESTION_DECLINE_VALUE)`, and an option chosen after «Altro…» calls `onAnswer(['a'])`; with
  `otherSelect` the «Altro…» row shows `getByRole('combobox', { name: otherSelect.label })` and a pick calls
  `onAnswer({ entity: 'acc-2' })`; `queryAllByRole('button')` is empty in every case; the root's class list holds no
  `bg-card`. Mutations: criterion 11's.
- `__tests__/consulenteInterviewTile.test.tsx` (new, React Testing Library): heading «Il colloquio», aside «2
  tornate», «1 tornata», «2 tornate · saltato»; a decline shows «Preferisco non dire», an «Altro» answer «Altro: …», a
  missing answer «non risposta»; no `data-generated` on the tile (decision 79); zero rounds and `null` render nothing. Mutation:
  «tornate» hard-coded → the «1 tornata» case fails.
- `__tests__/useConsulenteRun.test.tsx` (new, `renderHook` with a `QueryClientProvider` wrapper,
  `@/lib/utils/authFetch` mocked): criterion 15.
- `__tests__/useConsulenteInterview.test.tsx` (new, `renderHook`, `@/lib/utils/authFetch` mocked): a round streamed →
  `onRound` with a Date `askedAt` and `answers: []`; criterion 14's abort; an `error` event → `failed` with its
  sentence; a second `requestRound` in flight ignored.
- `reactCompilerCoverage` (unchanged): it compiles every file under app/, components/, contexts/ and lib/, the new
  components and hooks included; it stays green.
- **E2E** `e2e/allocation.consulente.interview.spec.ts` (new, desktop 1440; the faked route of § 5; the draft cleared
  in `beforeEach` as the existing spec does; `openConsulente` and `walkGoals` reused): (a) three rounds — round 1 (one
  single and one multiple question): «Continua» disabled and the status naming the first question; the single answered,
  the multiple's «Altro…» chosen (the other rows unchecked) with «fenicottero» typed; «Continua» → the recorded round-2
  request carries round 1 with its two answers, `{ other: 'fenicottero' }` among them; round 2 answered; round 3
  unsatisfied with one question, answered → the primary reads «Avvia la ricerca»; pressed → the recorded strategy body
  has `rounds.length === 3`, `skipped: false`, and the run screen shows the fake error; the rail per criterion 10 on
  the way; (b) criterion 4's skip on round 2; (c) the skip from the summary; (d) a reload on round 1 (criterion 7);
  (e) round 2 delayed 3 s by the handler: the skeleton (`[aria-busy="true"]`) with round 1's note above, «Salta il
  colloquio» → the strategy body holds round 1 only (criterion 14).
- **E2E** `e2e/allocation.consulente.interview.mobile.spec.ts` (new, 390): the faked round 1 with two questions; every
  choice row and the footer's buttons ≥ 44px tall (`boundingBox()`); «Altro…» opens its input; the repo's overflow
  guard (`main.scrollWidth === main.clientWidth` plus the walk of `main *`, as `e2e/fire.mobile.spec.ts`).
- **E2E** `e2e/allocation.consulente.report.spec.ts` (in develop since 2026-11-07, extended): its planted ready document (the `admin()`
  pattern of `e2e/assets.compravendita.spec.ts:41-45` @ ce26af4d) gains `interview` (two rounds, invented figures, one
  decline) and `revisionInterview` (one round) with a request in `revisions`; it asserts the «Il colloquio» tile
  (heading, «2 tornate», one question and its answer) and the round under the last request; a new test types
  «niente ornitorinchi» in «Chiedi una modifica», presses «Rivedi il report», sees the skeleton then the faked round's
  card, answers, presses «Rivedi il report» → the recorded revise body has `request: 'niente ornitorinchi'`,
  `interview.rounds.length === 1`, `skipped: false`; a second presses «Salta le domande» while the round is delayed →
  `interview: { rounds: [], skipped: true }`.
- **E2E** `e2e/allocation.consulente.spec.ts:126` @ ce26af4d asserts `button 'Avvia il colloquio'` and `button 'Salta
  il colloquio e avvia la ricerca'` on the summary (neither pressed); no other locator changes.

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the fifteen criteria; the outcome «after the summary the Consulente asks 0–4 pointed questions, up to three
  times, and the strategy reads the answers; before a revision it asks one round about the request; nothing is
  written before the strategy, and the report shows the questions and answers».
- **B**: `INTERVIEW_CONTRACT` read with the owner — it is the product's voice — and the copy of `INTERVIEW_COPY`, the
  tile's aside and the revision tile.
- **C**: `node -v` on 24 (decision 33); `npx tsc --noEmit`; `npm run lint`; Vitest whole under `TZ=Europe/Rome`, in the
  machine's zone and under `TZ=UTC` (the thirteen suites of § 6 among them); with the emulators up (`npm run
  emulators` + `emulators:seed`) `npx playwright test e2e/allocation.consulente.spec.ts
  e2e/allocation.consulente.interview.spec.ts e2e/allocation.consulente.interview.mobile.spec.ts
  e2e/allocation.consulente.report.spec.ts`; `npm run build`, the Consulente route's First Load JS recorded in
  SESSION_NOTES (a dynamic route with no key in `perf/budget.json`; no `mobile:budget` entry).
- **D**: a throwaway `__tests__/zz-emulator-interview.test.ts` (AI-04-Q7): `vi.mock('server-only')`,
  `@/lib/firebase/config` mocked as the run test does, the SDK answered by `vi.spyOn(Anthropic.Beta.Messages.prototype,
  'stream')`, run once with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and the seed: (1) over a planted ready document
  `runInterviewRound` leaves it as it was (`updatedAt` and `status` read back); the spied call's `system` never holds
  the decoy «ornitorinco» typed in `answers.notes`, its `userContent` does; (2) `runAllocationAdviceStage({ stage:
  'strategy', answers, interview })` → the Firestore document carries `interview` and `mapAllocationAdviceData` reads
  `askedAt` back as a Date; (3) `revise` with a revision round → `revisionInterview` stored.
- **E**: screenshots in the scratchpad (never committed) with the faked route, at 390 and 1440 in dark and light, 768
  in dark: the scene (one single, one multiple, «Altro…» open), the skeleton, the report's «Il colloquio» tile, the
  revision tile with its round.
- **F**: at the owner's «pronto», on the mirror (`npm run mirror:seed -- <email>`): ONE real interview (up to three
  rounds), the strategy, then ONE «Chiedi una modifica» with its round — at most six of the twelve slots. The owner
  judges the questions' bite («interessanti e pungenti»), whether the report's «La situazione» uses the answers, and
  the `note`s read aloud; each round's wall time goes to SESSION_NOTES. `npm run mirror:remove` after.
- **G**: the throwaway test, the scripts and the screenshots deleted, the mirror removed; `SESSION_NOTES.md` not
  committed.

## 8. Putting it into service

Branch `feat/consulente-colloquio`, commit `feat(consulente): the interview — up to three rounds of questions before
the strategy, one before a revision`, PR to `develop`. No flag: the summary offers «Salta il colloquio e avvia la
ricerca» for whoever wants the old path.

## 9. Documentation

- `doc/guide/consulente.md` (205 lines today, English since 2026-11-01; ~+22):
  - § Files: «`app/api/allocation-advice/run/route.ts` (SSE, `maxDuration = 300`, 6 runs an hour)» becomes «(SSE,
    `maxDuration = 300`, 12 model requests an hour per warm instance: interview rounds, strategy, revise)»; Pure gains
    `lib/utils/questionSet.ts` (the one question schema, shared with the Assistente) and `allocationAdviceInterview.ts`;
    the components gain `components/ui/question-card.tsx`, `ConsulenteInterviewScene.tsx`,
    `ConsulenteInterviewTile.tsx`, `ConsulenteRevisionTile.tsx`, `useConsulenteInterview.ts`; Models: «(Opus 5.5: the
    interview, the strategy, the review)»; the suites gain `questionSet`, `allocationAdviceInterview`,
    `allocationAdviceDocument`, `questionCard`, `consulenteInterviewTile`, `useConsulenteRun`, `useConsulenteInterview`;
    «`e2e/allocation.consulente.spec.ts` (the eight screens on the base fixture, NEVER the run: a test does not open a
    control that spends)» becomes «`e2e/allocation.consulente.spec.ts` (the eight screens),
    `allocation.consulente.interview.spec.ts` and `.interview.mobile.spec.ts` (the interview),
    `allocation.consulente.report.spec.ts` (the report, the revision's round): `/api/allocation-advice/run` is always
    faked with `page.route`, no test spends».
  - § The path: ««Avvia la ricerca» is disabled without the key on the server («Servizio AI non configurato»)» becomes
    «its primary is «Avvia il colloquio» («Torna al colloquio» once a round exists, with «Ricomincia il colloquio»),
    its secondary «Salta il colloquio e avvia la ricerca»; both are disabled without the key («Servizio AI non
    configurato»)»; a new bullet **The interview** (the scene after the summary, «Passo N di 8» untouched; rounds ≤ 3
    and `canRequestRound`; the round in the draft at once, `phase`, `readStoredDraft`, `reopenStoredDraft`; «Salta il
    colloquio» commits the round as it stands; the skeleton and the abort; the rail's ticks; `QuestionCard`'s
    reserved rows).
  - § The run: «(`maxDuration = 300`, body `{ userId, stage, answers? }`, the rate limit counts only the `strategy`)»
    becomes «(`maxDuration = 300`, body `{ userId, stage, answers?, request?, interview?, revision? }`, the rate limit
    counts the interview rounds, the `strategy` and `revise`: 12 an hour per warm instance)»; a new bullet **The
    interview round** (`stage: 'interview'` never enters `runAllocationAdviceStage`; `runInterviewRound` on the
    strategy's model and effort, 16000 tokens, `interviewRoundSchema` as the structured output, no web search,
    `parseInterviewRound` lenient because the API keeps only part of the schema, the one terminal `interview` event,
    no store write; the strategy writes `interview` into the new document).
  - § The report and «Applica»: in «Chiedi una modifica», «(1–1000 characters, counted in the rate limit as a run)»
    becomes «(1–1000 characters; one round of questions about it first, «Salta le domande» available; the round and
    the revise each take a slot; the round stored as `revisionInterview`)»; a sentence on the «Il colloquio» tile.
  - § Per-page blind spots: «No E2E spec of the run, by the rule of the tests that do not spend; …» becomes «The run's
    E2E specs fake the route: one `page.route` handler scripts the interview's rounds and records the strategy and
    revise bodies, answered with an error so the chain stops; no test spends, and the real run is made once per change
    on the mirror.»; new blind spots: «The interview writes nothing: its rounds live in the draft until the strategy,
    and a cleared storage loses them» · «A round abandoned («Salta il colloquio» while it is asked, or leaving the
    page) still costs its slot; its late answer is ignored» · «The revision's round lives in the tile's memory: a
    reload before «Rivedi il report» loses it, and its slot» · «Twelve requests an hour: a run with three rounds is
    four, a revision with its round two» · ««Rifai il percorso» drops an interview the document on screen already used
    (`reopenStoredDraft`)».
- `AGENTS.md` (991 lines; net 0): the first Consulente bullet (`AGENTS.md:451` @ ce26af4d) is rewritten with the
  clause «then an interview of up to three rounds of questions that writes nothing until the strategy (2026-11;
  `questionSet.ts` is the one question schema, shared with the Assistente); the strategy and the interview read the
  YTD bundle AND the cashflow block (`lib/utils/cashflowBlock.ts`)» (the strategy's half already stands in § Assistant · Assistente since 2026-11-07) after
  «the draft on the browser)»;
  `AGENTS.md:455` @ ce26af4d «A probe never runs the Consulente: the E2E spec walks the screens and stops at «Avvia la
  ricerca».» becomes «A probe never runs the Consulente's model: the E2E specs fake `/api/allocation-advice/run` with
  one `page.route` handler (the interview's rounds scripted, the strategy and revise bodies recorded and answered with
  an error).».
- `CLAUDE.md`: § Key Features › Allocazione, «— eight screens, two agents, a proposal applied with one button and a
  date to review it by.» becomes «— eight screens, an interview of up to three rounds (2026-11), two agents, a proposal
  applied with one button and a date to review it by.»; § Key Files «Shared primitives / utils» adds `question-card` to
  the `components/ui/{…}.tsx` list (one name; `questionSet.ts` is named in the guide's § Files only).
- `Draft Release Temp.md`: ONE English sentence prepended to the «Allocazione — Consulente» entry, after its bold
  title, the rest untouched: «Before the strategy the Consulente now asks you up to three rounds of pointed questions
  about what it sees in your accounts and in your answers, and one round before a change you ask for on the report;
  you can skip them, and the report shows what you answered.»
- `doc/ai/README.md` § 6: AI-04's row «implemented on …, PR #… in develop since …».

## 10. Declared out of scope

- The chat's fenced-block questions: AI-06 (it reuses `questionSet.ts`, `parseQuestionsLenient`, `QuestionCard` with
  `otherSelect` and `decline`).
- A server-held draft of the interview: never (decision 23).
- More than one round before a revision: never (decision 24).
- Web search in the interview: never (A5; a structured output refuses citations).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Allocazione › Consulente, § Assistant · Assistente, § React Query and Derived State,
§ React Compiler and the hooks rules, § Accessibility, § Commands), doc/guide/motion.md, DESIGN.md § 5 «AI Surfaces» (The AI-Accent
Rule, The Question-Card Rule, The Path-Scene Rule), doc/guide/consulente.md, doc/guide/e2e-emulatori.md,
doc/ai/README.md § 3-4-7-8, doc/ai/AI-04-colloquio.md e i diff di AI-02 e AI-03 (sono in develop). Node 24
(`node -v`): un gate su un'altra versione non vale. Implementa AI-04 così com'è scritta: questionSet.ts e
question-card.tsx con i contratti della § 4 (identici: li usa AI-06); la richiesta `stage: 'interview'` della route,
che chiama runInterviewRound e MAI runAllocationAdviceStage, senza scritture su allocationAdvice/{uid};
parseInterviewRound tollerante; il colloquio nel draft (phase, interview, readStoredDraft, reopenStoredDraft); la scena
con PathRail, lo scheletro e «Salta il colloquio» che annulla la tornata in volo; la tessera «Il colloquio»; la
tornata prima di «Chiedi una modifica»; il blocco IL COLLOQUIO nei prompt con il system invariato (toBe fra due
chiamate); il rate limit a 12. Test: le suite della § 6 — questionSet, allocationAdviceInterview,
allocationAdviceProposal, allocationAdvicePrompts, allocationAdviceRun, allocationAdviceRoutes,
allocationAdviceDocument, allocationAdviceDraft, i .test.tsx questionCard, consulenteInterviewTile, useConsulenteRun,
useConsulenteInterview, e reactCompilerCoverage — Vitest in entrambe le zone, le spec Playwright con la route SEMPRE
finta. Fermati e chiedimi se: un contratto di AI-02 o AI-03 nel codice, o una regola di DESIGN.md § 5 «AI Surfaces»,
differisce da quello citato nella § 4; una suite verde
prima di te diventa rossa per un motivo fuori da questa spec. Collaudo: § 7; la corsa vera una volta, sul mirror, al
mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Fable 5.1**, effort **xhigh**. Estimated size: 1 long session, ~7 h; ~260 lines pure (`questionSet`,
`allocationAdviceInterview`, the proposal's schemas, the draft), ~140 `question-card.tsx`, ~220 server (prompts, run,
route), ~340 client (the scene, two hooks, two tiles, Wizard, Report), ~600 tests, two new E2E specs and two extended.
