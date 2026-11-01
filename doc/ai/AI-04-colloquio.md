# AI-04 — The interview: the critical friend before the strategy

> Series `doc/ai/` (README.md § 5): **depends on AI-02** (the cashflow block the interview reads) **and AI-03**
> (`ChoiceList`, the rail with the interview's ticks); **AI-06 depends on it** (`lib/utils/questionSet.ts`,
> `QuestionCard`). Written on 2026-11-01 from `develop` @ b9411a4d. Executes decisions 4, 6, 8 and the adopted
> choices A1–A6, A22.

## 1. The problem today (evidence on the code)

- **The path ends with a click that spends**: the Summary screen (`ConsulenteWizard.tsx:343` @ b9411a4d) calls
  `run.start(answers)`; `useConsulenteRun.start` (`components/allocation/consulente/useConsulenteRun.ts:76-110`) sends
  `{ stage: 'strategy', answers }` and then chains `instruments`, `review`. The model's first word to the user is the
  report, six minutes later. Nothing between the eight answers and the strategy lets the model ask «sei sicuro?».
- **The answers are thin where the money is**: `AllocationAdviceAnswers` (`lib/utils/allocationAdviceProposal.ts:54`)
  has age, horizon, loss tolerance (3 options), exchange, broker, distribution policy, goals, roles, `avoid`,
  `missing` — no income stability, no emergency fund size, no dependants, no expected big expense, no debt plan; the
  cashflow block of AI-02 will show the facts, but not the user's intentions about them.
- **The run's contract is one request per stage** (`app/api/allocation-advice/run/route.ts:53-56`:
  `stage` ∈ `ALLOCATION_ADVICE_RUN_STAGES` ∪ `revise`; `answers` parsed only for `strategy`; the rate limit counts
  `strategy` and `revise`, :72). The document is created by the strategy (`runAllocationAdviceStage`, `run.ts:346-355`:
  `priorPlanOf(previous)` read BEFORE `newDocument` replaces it) — a stage that wrote the document before the strategy
  would destroy the plan in force.
- **Structured output exists for strategy and review** (`ALLOCATION_ANSWER_FORMAT`, `run.ts:94`;
  `callModel({ structured: true })`); the SDK form is `output_config.format = { type: 'json_schema', schema }` from
  `betaZodOutputFormat(schema).schema`. The API writes object keys in the schema's order (the guide § La corsa).
- **The draft lives in localStorage** (`allocation-advice-draft:{uid}` = `{ step, goalIndex, answers }`,
  `allocationAdviceDraft.ts:186-215`; `readStoredDraft` has no zod — an unknown field is kept as is).
- **The E2E spec never clicks «Avvia la ricerca»**; a faked route (`page.route`) is the harness's way to show a run.

## 2. Goal and acceptance criteria

After the summary, the Consulente reads the answers and the data and asks the user pointed questions, in rounds,
until it is satisfied or three rounds are spent; the answers go to the strategy.

1. **A new run stage `interview`** exists in `AllocationAdviceRunStage` and the route accepts
   `{ stage: 'interview', answers, interview?: AllocationAdviceInterview }`: it builds the context (the YTD bundle,
   the cashflow block of AI-02, the prior plan read-only), calls Opus 5.5 at effort `medium` with
   `interviewRoundSchema` as the structured output, and streams `{ type: 'interview', round }` then `done` — **without
   writing `allocationAdvice/{uid}`** (A1). Proof: `allocationAdviceRun.test.ts` asserts `setAllocationAdviceAdmin`
   and `patchAllocationAdviceAdmin` are not called by the interview stage; `allocationAdviceRoutes.test.ts` the body
   parsing and the 400 on a malformed `interview`.
2. **A round is 0–4 questions, each with 2–4 options and `allowOther`**, each with a one-line `why` (what in the
   data prompted it) and a `kind` (`single | multiple`); the round carries `note` (the model's reading, 1–2 sentences,
   written BEFORE the questions) and `satisfied: boolean`. Proof: `questionSet.test.ts` on the schema (5 questions
   rejected; 1 option rejected; `note` precedes `questions` in the JSON schema's `properties` order).
3. **The client runs up to three rounds** (decision 6): round 1 starts from «Avvia il colloquio» on the summary;
   after the user answers a round, «Continua» requests the next with every previous round's Q&A; a round with
   `satisfied: true` or zero questions ends the interview; after round 3 the client does not ask for a 4th (the
   button reads «Avvia la ricerca»). Proof: a Vitest test on the pure `interviewReducer` (below): `canRequestRound`
   false at 3; E2E with a faked route returning three rounds then asserting the button label.
4. **«Salta il colloquio» is always offered** (A3), also mid-interview; a skipped interview is `{ rounds: [...so far], skipped: true }`.
   Proof: E2E clicks it on round 2 and the strategy body carries `skipped: true` (the faked route records the body).
5. **The Q&A reach the strategy, the review and the revision prompts** as a block
   `--- IL COLLOQUIO (N tornate) ---` after the answers block, via `formatQuestionAnswersForPrompt(interview)`;
   the `system` of each prompt is byte-identical to AI-02's. Proof: `allocationAdvicePrompts.test.ts` snapshots.
6. **The document persists the interview**: `AllocationAdviceDocument.interview?: AllocationAdviceInterview | null`
   written by the strategy stage with the body's `interview` (the only writer), mapped by
   `mapAllocationAdviceData` for both SDKs. Proof: `allocationAdviceDocument.test.ts` round-trip.
7. **The draft keeps the interview across a reload**: `AllocationAdviceDraft.interview?: AllocationAdviceInterview`
   in the localStorage draft; `readStoredDraft` validates it with `interviewSchema` and drops a malformed one
   (today's lenient read gains a zod for THIS field only). Proof: `allocationAdviceDraft.test.ts`.
8. **The report shows «Il colloquio»** (A6): a tile with the rounds, each question, the answer (option label or free
   text), the model's `note`; `aside` = «N tornate · saltato» when skipped; absent when the document has no
   interview (older documents). «Rifai il percorso» does not prefill it. Proof: a render test of `ConsulenteReport`
   with/without `interview`; the E2E report spec of AI-03 extended with a seeded interview.
9. **The rate limit counts the interview** (A2): `RUN_RATE_LIMIT_MAX` 6 → 12; `interview`, `strategy`, `revise` each
   take a slot. Proof: the routes test (12 interview calls then 429).
10. **The rail lights the interview** (AI-03's three ticks): «Colloquio · tornata N di 3» as the eyebrow, the N-th
    tick `aria-current`. Proof: E2E with the faked route.
11. **The question card obeys The Question-Card Rule** (AI-01): `components/ui/question-card.tsx`, the AI accent on
    the border and the eyebrow, `ChoiceList` rows, «Altro…» in place, 44px, one «Rispondi» per ROUND (the card list is
    a form; a question unanswered blocks «Continua» with `describeInterviewBlock`), not per question. Proof: RTL test
    + the E2E.
12. **The prompt is a critical friend**: the system prompt tells the model to ask only what the DATA or the ANSWERS
    make doubtful (a concentrated income with a 20-year horizon and «Alta» tolerance; a goal in 3 years with 80%
    equities; an emergency fund absent from the liquid accounts; a loan instalment and a «nothing to avoid»), one
    `why` per question citing the figure, never a question the answers already settle, never advice. Proof: a
    prompts test asserts the sentences exist; the owner's one real run in phase F judges the bite.

## 3. Decisions

- **Decision 4** (before the strategy), **6** (as long as needed, cap 3), **8** (Opus 5.5 medium, structured).
- **A1** (client-held until the strategy), **A2** (12/h), **A3** (skip always), **A4** (same data as the strategy +
  previous rounds), **A5** (16000 tokens, no web, `note` before `questions`), **A6** (report tile, no prefill),
  **A22** (a stage after the summary, «Passo N di 8» untouched).
- **Adopted, reversible**: the interview's `answers` sent with each round request are the CURRENT draft answers (the
  user may go back and change a screen between rounds; the next round sees the change).
- **Adopted, reversible**: a `kind: 'multiple'` question is answered as `string[]`; a `single` as `string`; «Altro»
  as `{ other: string }`; a question may be answered «Preferisco non dire» (a built-in option the card always
  appends; the prompt is told so and the strategy reads it as such) — this is the escape hatch that keeps «Rispondi»
  honest without a blank.
- **Adopted, reversible**: the interview stage is NOT retried from `useConsulenteRun`'s chain (it is not in
  `ALLOCATION_ADVICE_RUN_STAGES`): it has its own small hook `useConsulenteInterview` (request one round, state
  `idle | asking | failed`), and a failed round shows «Riprova» or «Salta il colloquio».
- **Adopted, reversible**: the strategy's `userContent` block names unanswered questions («non risposta») so the
  model knows the silence was a choice.

## 4. Solution

### `lib/utils/questionSet.ts` (pure, the shared contract with AI-06)

```ts
import { z } from 'zod';

export const QUESTION_MAX_PER_ROUND = 4;
export const QUESTION_OPTIONS_MIN = 2;
export const QUESTION_OPTIONS_MAX = 4;
export const QUESTION_DECLINE_VALUE = '__decline__';
export const QUESTION_DECLINE_LABEL = 'Preferisco non dire';

export const questionOptionSchema = z.object({ value: z.string().min(1).max(40), label: z.string().min(1).max(80), description: z.string().max(160).optional() });
export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['single', 'multiple']),
  text: z.string().min(1).max(240),
  /** What in the data prompted it — the «why» the card prints under the question. */
  why: z.string().min(1).max(240),
  options: z.array(questionOptionSchema).min(QUESTION_OPTIONS_MIN).max(QUESTION_OPTIONS_MAX),
  allowOther: z.boolean(),
});
export const questionSetSchema = z.array(questionSchema).max(QUESTION_MAX_PER_ROUND);

export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionAnswer = { questionId: string; value: string | string[] | { other: string } | typeof QUESTION_DECLINE_VALUE };

/** The fenced-block path (AI-06's chat): questions parsed leniently, the readable ones kept, the refused logged. */
export function parseQuestionsLenient(raw: string): { questions: Question[]; refused: string[] };
export function answerOf(answers: readonly QuestionAnswer[], questionId: string): QuestionAnswer['value'] | null;
/** «Preferisco non dire» appended as the last option; never duplicated. */
export function withDeclineOption(question: Question): Question;
export function describeAnswer(question: Question, answer: QuestionAnswer['value']): string; // option label(s) | «Altro: …» | «preferisce non dire»
export function formatQuestionAnswersForPrompt(rounds: ReadonlyArray<{ note: string; questions: Question[]; answers: QuestionAnswer[] }>, header: string): string;
```

### Types (`types/allocationAdvice.ts`)

```ts
export type AllocationAdviceRunStage = 'interview' | 'strategy' | 'instruments' | 'review' | 'revise';
// ALLOCATION_ADVICE_RUN_STAGES stays ['strategy', 'instruments', 'review'] — the chain «Avvia la ricerca» runs.
export const ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS = 3;
export interface AllocationAdviceInterviewRound { note: string; satisfied: boolean; questions: Question[]; answers: QuestionAnswer[]; model: string; askedAt: Date }
export interface AllocationAdviceInterview { rounds: AllocationAdviceInterviewRound[]; skipped: boolean }
export type AllocationAdviceRunEvent =
  | { type: 'stage'; stage: AllocationAdviceStage }
  | { type: 'interview'; round: Omit<AllocationAdviceInterviewRound, 'answers'> }
  | { type: 'done'; document: AllocationAdviceDocument | null }   // null for the interview stage
  | { type: 'error'; error: string; retryable?: boolean };
// AllocationAdviceDocument gains `interview?: AllocationAdviceInterview | null`.
```

`interviewRoundSchema` (in `lib/utils/allocationAdviceProposal.ts`, beside the answer schema, so the wire form is one
file): `z.object({ note: z.string().max(600), satisfied: z.boolean(), questions: questionSetSchema })` — `note` first.
`interviewSchema` for the request body: rounds with answers, `skipped`.

### Server

- `lib/server/allocationAdvice/prompts.ts`: `INTERVIEW_CONTRACT` (criterion 12's sentences; «rispondi con l'oggetto
  JSON: `note` (1–2 frasi: cosa vedi), `satisfied`, `questions` (0–4) …»; «una domanda ha 2–4 opzioni concrete, con
  numeri quando i dati li danno («la tua unica fonte di reddito copre l'86% delle entrate»), `allowOther` quando una
  risposta libera serve»; «non chiedere ciò che le risposte dicono già»; «dopo la terza tornata non ci sarà una
  quarta: se qualcosa resta, dillo nella `note`»); `buildInterviewPrompt(answers, dataBlock, cashflowBlock, priorPlan, previousRounds)`
  → `{ system: CONSULENTE_CORE + INTERVIEW_CONTRACT, userContent }`; `buildStrategyPrompt/ReviewPrompt/RevisionPrompt`
  gain `interview: AllocationAdviceInterview | null` and append `formatQuestionAnswersForPrompt(rounds, 'IL COLLOQUIO')`
  after the answers block (skipped → «L'utente ha saltato il colloquio dopo N tornate»).
- `run.ts`: `ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS = 16000`; `INTERVIEW_FORMAT` from `interviewRoundSchema`;
  `runInterviewRound({ userId, answers, previousRounds, onRound, now })`: builds the context (the same calls as
  `runStrategy`: `buildAssistantYtdContext`, `fetchConsulenteCashflowInputs`, `priorPlanOf(await getAllocationAdviceAdmin(userId))`),
  `callModel('context' as the stage label for errors → add `'interview'` to `AllocationAdviceStage`? NO: the
  document's stages are unchanged; the error class gets a union member `AllocationAdviceStage | 'interview'` for its
  `stage` field), parses with `interviewRoundSchema.safeParse(JSON.parse(text))`, emits `onRound`. No store write.
  `runAllocationAdviceStage` branches: `stage === 'interview'` → `runInterviewRound` and returns `null`;
  `stage === 'strategy'` → `document.interview = interview ?? null` before `setAllocationAdviceAdmin`.
- `route.ts`: `interview` parsed with `interviewSchema` for `interview` (previous rounds) and `strategy`; the
  rate-limit condition adds `stage === 'interview'`; `RUN_RATE_LIMIT_MAX = 12`; the stream emits `{ type: 'interview', round }`.

### Client

- `lib/utils/allocationAdviceInterview.ts` (pure): `interviewReducer(state, action)` with state
  `{ rounds, current: { round, answers } | null, skipped }`, actions `roundReceived | answer | commitRound | skip | reset`;
  `canRequestRound(state)` (rounds < 3 and the last not `satisfied`); `describeInterviewBlock(state)` (the first
  unanswered question's text → «rispondi a «…» o scegli “Preferisco non dire”»); `toRequestInterview(state)`.
- `components/allocation/consulente/useConsulenteInterview.ts`: `requestRound(answers, previousRounds)` → the
  route, `forEachSseEvent`, `{ ok, round } | { ok: false, error, retryable }`; state `idle | asking | failed`.
- `components/ui/question-card.tsx`: `QuestionCard({ question, index, total, answer, onAnswer, eyebrow })` — the
  card per The Question-Card Rule: `bg-card` + AI-accent border/glow, eyebrow «Il Consulente chiede · {index} di
  {total}» (or the caller's), `text` 16/20px, `why` 13px muted, `ChoiceList` (single/multiple, `other` when
  `allowOther`, the decline option appended by `withDeclineOption`). No button inside: the ROUND has one.
- `ConsulenteWizard.tsx`: the summary's primary becomes «Avvia il colloquio» (secondary «Salta il colloquio e avvia
  la ricerca»); a new scene `interview` (not a step: `draft.step` stays 7, a `phase: 'path' | 'interview'` in the
  draft) renders the round's `note` as the headline, the `QuestionCard`s, the footer «Indietro» (to the summary,
  keeps the rounds) / «Salta» / «Continua» (→ next round) or «Avvia la ricerca» (when `!canRequestRound`); the rail's
  interview ticks light with the round. `run.start(answers, 'strategy', interview)`.
- `useConsulenteRun.start(answers, from, interview?)` sends `interview` with the strategy body only.
- `ConsulenteReport.tsx`: the tile «Il colloquio» (criterion 8), between «Le fasi» and «Allocazione proposta».
- `allocationAdviceDraft.ts`: `interview?` in the draft, `phase`, the zod on read for `interview`.
- `allocationAdviceDocument.ts`: `interview` mapped (dates via the existing `toDate`).

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **A1 / `priorPlanOf` read before replace** — here it means the interview stage NEVER calls `setAllocationAdviceAdmin`;
  the test of criterion 1 is the guard; a reload mid-interview loses nothing because the draft holds the rounds.
- **The silent-cap rule** — here it means «dopo la terza tornata non ci sarà una quarta» is in the prompt, and a
  round cut at 4 questions is declared in the schema's description.
- **`system` byte-identical** — the rounds, the answers, the data in `userContent`.
- **Structured output and `pause_turn`** — no web search in the interview: `callModel` without `webSearch`; the
  continuation loop is untouched.
- **Opus 5.5 refuses forced `tool_choice`** — not used; structured output is `output_config.format`.
- **AGENTS.md § a11y: radiogroup / group names** — each `ChoiceList` inside a `QuestionCard` takes the question's
  text as `label`; the round's blocking sentence is the page's `role="status"` (the one already in the footer).
- **React Compiler** — the interview reducer is pure; the `QuestionCard` list is keyed by `question.id`.
- **Rate limit per instance** — 12/h is per warm instance (the limiter's own note); fine for one user.
- **E2E: a probe never spends** — the interview route is FAKED in every spec (`page.route` with
  `{ type: 'interview', round }` then `{ type: 'done', document: null }`); the strategy is never started.
- **No owner data** — the faked rounds use invented figures («l'86% delle entrate» on the seed).

## 6. Tests per level (with the mutation that proves each)

- `__tests__/questionSet.test.ts` (new): schema bounds; `withDeclineOption` idempotent; `describeAnswer` for the four
  value shapes; `formatQuestionAnswersForPrompt` prints «non risposta» for a missing answer and «preferisce non
  dire» for the decline; `parseQuestionsLenient` keeps the good ones. Mutation: `max(4)` → `max(5)` fails the bound
  test; the decline appended twice fails idempotence.
- `__tests__/allocationAdviceInterview.test.ts` (new): the reducer; `canRequestRound` at 0/1/2/3 and with
  `satisfied`; `describeInterviewBlock` on a half-answered round. Mutation: `rounds.length <= 3` → a 4th round allowed.
- `__tests__/allocationAdvicePrompts.test.ts`: `buildInterviewPrompt` snapshot; the strategy's `system` unchanged
  from AI-02 (snapshot); the interview block's position. Mutation: put the block before the answers → fails.
- `__tests__/allocationAdviceRun.test.ts`: the interview stage makes one model call with `output_config.format`
  = the interview schema and `effort: 'medium'`, writes nothing; the strategy stage persists `interview`.
  Mutation: call `setAllocationAdviceAdmin` in the interview → fails.
- `__tests__/allocationAdviceRoutes.test.ts`: `stage: 'interview'` accepted; malformed `interview` → 400; the 13th
  call → 429. Mutation: drop `interview` from the rate-limit condition → the 429 test fails.
- `__tests__/allocationAdviceDocument.test.ts`, `allocationAdviceDraft.test.ts`: round-trips; a malformed stored
  `interview` dropped, the rest of the draft kept.
- `__tests__/questionCard.test.tsx` (RTL): the decline option present; «Altro» reveals the input; the group name is
  the question.
- `reactCompilerCoverage`: `QuestionCard`, the Wizard's interview scene, the report tile.
- **E2E** `e2e/allocation.consulente.interview.spec.ts` (desktop) + a mobile variant: the faked route returns round 1
  (2 questions) → answer → «Continua» → round 2 `satisfied` → the button reads «Avvia la ricerca» and the strategy is
  NOT clicked; a second test skips on round 1 and asserts the recorded body (`skipped: true`); the rail's ticks.

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the twelve criteria; the outcome «after the summary the Consulente asks 0–4 pointed questions, up to three
  times, and the strategy reads the answers; nothing is written before the strategy».
- **B**: the prompt's sentences (criterion 12) read with the owner — they are the product's voice; the tile's copy.
- **C**: `tsc`, lint, both-zone Vitest on the nine suites, the two E2E specs, `perf:budget`.
- **D**: on the emulators, after a faked interview + a REAL strategy? No — the strategy spends. Instead: a scratchpad
  script calls `runAllocationAdviceStage({ stage: 'strategy', answers, interview })` with the Anthropic client
  mocked (`vi.spyOn`) and asserts the Firestore document carries `interview` (the emulator's Admin SDK).
- **E**: screenshots of the interview scene at 390/1280 with the faked route (two questions, one «Altro» open).
- **F**: the owner's ONE real run on the mirror: the real interview (round 1, 2, maybe 3 — three slots), then the
  strategy; the owner judges the questions' bite («interessanti e pungenti») and whether the report's § 1 quotes
  the answers; the `note`s read aloud. `mirror:remove` after.
- **G**: scripts, screenshots, mirror removed; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

Branch `feat/consulente-colloquio`, commit `feat(consulente): the interview — up to three rounds of questions before
the strategy`, PR to `develop`. No flag: the summary offers «Salta» for whoever wants the old path.

## 9. Documentation

- `doc/guide/consulente.md`: § Il percorso → «Il colloquio» (the stage, the rounds, the draft, «Salta», the rail);
  § La corsa → the interview call (Opus 5.5 medium, 16000, structured, no store write, 12/h); § Il report → the tile;
  § Files → the new modules and suites; § Per-page blind spots → «the interview writes nothing: a reload before the
  strategy keeps the rounds in the draft, a cleared storage loses them» and «“Rifai il percorso” never prefills the
  interview».
- AGENTS.md § Consulente stub: «the interview precedes the strategy and writes nothing (2026-11); `questionSet.ts`
  is the one question schema (shared with the Assistente)».
- CLAUDE.md § Key Features › Consulente: «+ the interview (2026-11)»; § Key Files shared utils: `questionSet.ts`,
  `components/ui/question-card.tsx`.
- `Draft Release Temp.md`: «Prima di proporre, il Consulente ti fa qualche domanda: su cosa vede nei tuoi conti e
  nelle tue risposte. Puoi saltarle».
- `doc/ai/README.md` § 7: the contracts' «implemented» marks.

## 10. Declared out of scope

- The chat's fenced-block questions: AI-06 (it reuses `questionSet.ts` and `QuestionCard`).
- Persisting the interview before the strategy (a server draft): heir CLAUDE.md § Not yet present («the Consulente's
  interview is browser-held until the strategy»).
- The interview on «Chiedi una modifica» (a revision with questions): heir CLAUDE.md § Not yet present.
- Web search in the interview: never (structured output excludes citations).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Consulente, § Assistente, § React Compiler, § a11y), DESIGN.md § 5 «AI Surfaces»,
doc/guide/consulente.md, doc/guide/e2e-emulatori.md, doc/ai/README.md § 3-4-7, doc/ai/AI-04-colloquio.md, e i diff
di AI-02 e AI-03 (sono in develop). Implementa AI-04 così com'è scritta: questionSet.ts e question-card.tsx con i
contratti della § 4 (identici: li usa AI-06), la fase `interview` della route e di run.ts SENZA scritture su
allocationAdvice/{uid}, il reducer puro, il draft con zod sul solo campo interview, la scena nel Wizard con la
rail, la tessera nel report, i prompt con il blocco IL COLLOQUIO e il system della strategia invariato (snapshot).
Vitest in entrambe le zone, le spec Playwright con la route SEMPRE finta. Collaudo: § 7; la corsa vera una volta,
sul mirror, al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md
non si committa.
```

Model: **Fable 5.1**, effort **xhigh**. Estimated size: 1 long session, ~6 h; ~200 lines pure (`questionSet`,
`allocationAdviceInterview`), ~120 `question-card.tsx`, ~150 server (prompt, run, route), ~200 client (Wizard scene,
hook, report tile), ~350 tests, two E2E specs.
