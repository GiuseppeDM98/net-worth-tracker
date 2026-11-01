# The AI series — a Consulente that asks, an Assistente that records

> Planning session of 2026-11-01 (branch `plan/consulente-assistente-serie`, from `develop` @ b9411a4d). This folder
> holds ONE spec per implementation (`AI-NN-*.md`, on the same template as the 14 PERF and the 9 MOB specs, all
> retired; each with the prompt, the model and the effort at its end) and this index: the owner's points in the
> owner's words, the numbered decisions, the order with its dependencies, the shared contracts and the rules that bind
> every spec. **Implementation starts AFTER the adversarial reading** (prompt `07_LETTURA_ADVERSARIALE_SPEC`, the session
> after this one, never this one) and after the retirement prompt that `08_CREA_RITIRO_SPEC` generates. Then the cycle
> is implementation → retirement → implementation, each in its own session (WORKFLOW.md § Where things are recorded).

## 1. The owner's points (their words, 2026-11-01)

1. **Consulente (Allocazione)** — «dopo che l'utente risponde alle domande poste dal percorso, il consulente le
   analizzasse e in base a quanto analizzato ponesse delle domande all'utente, nella modalità tipo di AskUserQuestion di
   Claude Code … il consulente facesse tipo da "amico critico" dell'utente, ponendo delle domande interessanti e
   pungenti. … avere accesso a tutti i dati di transazioni di cashflow, così può vedere quanto l'utente spende, quanto
   incassa, dove spende, quanto sono concentrati gli stipendi … migliorare e spingere sul design di questa funzionalità,
   deve essere molto ma molto curata e bella, con qualche animazione … usare sia la skill nativa /design che /impeccable
   per proporre due/tre concetti di redesign da cui scegliere».
2. **Assistente AI** — «capace a creare ed inserire spese/entrate per l'utente, in una chat dedicata … "Ciao, ho fatto
   spesa per 103 euro, per favore segnalo" … avendo accesso a tutte le categorie e sottocategorie e potendo analizzare
   (o magari lo ricorda in memoria) come l'utente categorizza le spese, può proporre un box tipo quello che viene posto
   in fase di definizione obiettivo … può chiedere dettagli aggiuntivi, tipo il conto di prelievo/destinazione, se
   applicare un centro di costo, la spesa di chi è, se è fuori budget … con uno strumento di tipo AskUserQuestion …
   in fase di scelta del conto di prelievo ci potesse essere una tendina/radio button».

## 2. What the code does today (the analysis in short; the detail in each spec § 1)

- **The Consulente does NOT see the whole cashflow**: the strategy receives the Assistente's YTD bundle
  (`buildAssistantYtdContext` + `formatBundleForPrompt`): totals, by type, by category and subcategory, income by
  category ONLY, the 10 largest single expenses. No monthly series, no previous year (in January the block is one
  month), no income concentration, no accounts, no recurrences. The prompt's «sono esaustivi» line never names the
  CASHFLOW and the strategy contract never asks the model to use it (`lib/server/allocationAdvice/prompts.ts:148-158`
  @ b9411a4d).
- **The path is eight screens with no motion** (`ConsulenteWizard.tsx`, 471 lines; no `framer-motion` in the folder);
  the choices are `ChoiceRows` (a Radix `RadioGroup`, duplicated in `components/assets/compravendita/fields.tsx`), the
  run is a list of four stages with a spinner, the report seven standard tiles.
- **The Assistente writes nothing**: its only protocol is the ```goal-proposal (a fenced block in the markdown; the
  `GoalProposalCard` intercepts `pre`; the write on «Conferma» goes through `POST/PATCH /api/goals`). The prompt prints
  the categories by NAME without ids, no account with an id, no cost centre, no member with an id, no recent rows; the
  messages are TEXT (`store.ts` `appendAssistantMessage`); the card forgets its confirmation after a reload (a blind
  spot since 2026-09-19).
- **Writing a row has ONE client contract**: `createExpenseSettledOnDate` → `applyDebtRepayments` →
  `applyBalanceEffects` (the service signs the amount, puts the fee in the same batch, moves the balance on the date,
  invalidates the server summary); the Compravendita already drives it from a plan (`executeRealEstatePlan`).

## 3. The owner's decisions (2026-11-01, numbered; cited as «decision N»)

| N | Decision |
|---|---|
| 1 | The series is born in `doc/ai/` with the prefix `AI-NN`, one series for both points. |
| 2 | Dependencies (rule 8): the 34 new advisories with a non-major fix are upgraded in **a dedicated session BEFORE the first implementation** (AI-00); `doc/guide/dipendenze.md` created on 2026-11-01. |
| 3 | The 2–3 redesign concepts are produced **in a spec of their own** (AI-01), before the implementation; the choice enters DESIGN.md and the guide. |
| 4 | The «critical friend» interview sits **after the eight screens and BEFORE the strategy**: its answers enter the strategy prompt. |
| 5 | «Registra» is **a mode of the Assistente** (a new `AssistantMode`, with no period) **with a bridge from Cashflow › Tracciamento** (`/dashboard/assistant?mode=registra`). |
| 6 | The interview lasts **as long as it needs, capped at three rounds**; each round up to 4 questions, each question 2–4 options plus free text. |
| 7 | The Consulente receives **an aggregate block on the last 12 months + 24 months of monthly series** (income by category/source with its concentration, expenses by category and subcategory, the income/expenses/savings series, the recurring rows, the accounts with their balance, the spending volatility), from a pure function, printed whole or with the cut declared. |
| 8 | The interview questions are asked by **Opus 5.5, effort medium**, as a structured output. |
| 9 | Row types from the chat: **expenses (necessary/non-necessary), income, transfers between accounts, loan instalments (debt)**. |
| 10 | Details the assistant may ask: **debit/credit account, cost centre, household member, out of budget** — only when they are needed. |
| 11 | Beside «Conferma» and «Ignora», **«Modifica» opens `ExpenseDialog` prefilled** (new `initialValues` prop). |
| 12 | **Yes to recurring series** (monthly/yearly) from the chat. |
| 13 | How it learns to categorise: **recent history in the prompt + explicit rules in memory** (`preference` items). |
| 14 | The redesign covers **path, interview, run and report**; the Allocazione page itself does not change. |
| 15 | **`--ai-accent` extends to the AI surfaces** (Consulente and Assistente): AI-01 rewrites the DESIGN.md sentence — the accent marks what the model generated (a border, a glow on hover), never buttons nor cards. |
| 16 | Registra is entered from **an action in the Assistente header + the Cashflow bridge**; in that mode the period pill disappears. |
| 17 | On «Conferma» **the browser writes through today's services** (`createExpenseSettledOnDate` + `applyBalanceEffects`), never a new server route. |
| 18 | The card's «confirmed» state **is saved on the thread's message**, with ONE mechanism for the expense card AND the goal card (closes the blind spot of 2026-09-19). |
| 19 | Series order: **AI-00 → 01 → 02 → 03 → 04 → 05 → 06** (the Consulente first; the Assistente reuses its primitive). |
| 20 | **Every tracked document is in English** (WORKFLOW.md rule 4, 2026-11-01): the guide `dipendenze.md`, this index and the seven specs were rewritten from Italian in the planning session; Italian only for quoted UI text, page names and the owner's words. |

## 4. The adopted choices (reversible before the implementation; each is repeated in the spec that uses it)

| A | Adopted choice | Spec |
|---|---|---|
| A1 | The interview's questions and answers live in the browser (the draft `allocation-advice-draft:{uid}`) until the `strategy` request carries them to the server: no write to `allocationAdvice/{uid}` before the strategy (a write before it would destroy the plan in force and `priorPlanOf`). | AI-04 |
| A2 | Each interview round consumes one slot of the rate limit; `RUN_RATE_LIMIT_MAX` goes from 6 to 12 an hour. | AI-04 |
| A3 | «Salta il colloquio» is always available (in rounds 2 and 3 too); a skipped interview is recorded (`skipped: true`). | AI-04 |
| A4 | The interview reads the SAME data as the strategy (the bundle + the cashflow block of AI-02 + the plan in force) plus the previous rounds; a round with zero questions closes the interview. | AI-04 |
| A5 | Round budget: `ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS = 16000`, no web search, `interviewRoundSchema` as `output_config.format`; the model writes `note` BEFORE `questions` (the API emits the keys in the schema's order). | AI-04 |
| A6 | The report shows a tile «Il colloquio» (rounds, questions, answers); «Rifai il percorso» does NOT prefill the interview (it would be stale). | AI-04 |
| A7 | The cashflow block belongs to the Consulente ONLY (`buildConsulenteCashflowContext`), appended to the `userContent` of strategy and interview; `formatBundleForPrompt` (shared with the Assistente and the emails) does not change; the Assistente does not receive it (heir: CLAUDE.md § Not yet present). | AI-02 |
| A8 | The block's windows: aggregates on the last 12 full months + the current month (declared), a 24-month series; the rows read once per stage with the Admin `fetchExpenses`; every cut is written in the text (the silent-cap rule). | AI-02 |
| A9 | Registra runs on Sonnet 5.5 effort `high` (the Assistente's model), no web search, `ASSISTANT_REGISTER_MAX_TOKENS = 16000`; the proposal is a fenced ```expense-proposal block (the message store is text: a structured output or a tool would require persisting blocks). | AI-05 |
| A10 | The card writes with `createExpenseSettledOnDate` → `applyDebtRepayments` → `applyBalanceEffects` and invalidates `expenses.all`, `assets.all`, `dashboard.overview`, `costCenters.all` (the Compravendita's set). | AI-05 |
| A11 | The card's state lives in `proposals` on the message document (`Record<"expense:N"|"goal:N", {status, writtenIds, at}>`), written by `PATCH /api/ai/assistant/threads/[threadId]/messages/[messageId]`; the streaming message learns its id from `done.messageId` (ignored today) through a `MessageIdContext` around `ReactMarkdown`. | AI-05 |
| A12 | «Modifica» opens `ExpenseDialog` with `initialValues`; a save from there marks the card as written with the saved id. | AI-05 |
| A13 | A Registra thread is titled «Registrazioni», with `pinnedMonth`/`pinnedYear` null; `findThreadForPeriod` ignores it; `describeConversation` says «le righe proposte si scrivono solo su Conferma». | AI-05 |
| A14 | Registra's context: categories WITH id and type, liquid accounts with id, balance and the two defaults, active cost centres with id (when enabled), members with id (when the Divisione is on), the last 300 rows of the last 12 months (cut declared), the memory; NO period bundle, NO portfolio block. | AI-05 |
| A15 | In-chat questions are a fenced ```assistant-question block, ONE question per block, at most two blocks per message; the answer leaves as a user message («Conto: Fineco») and the model re-proposes. | AI-06 |
| A16 | A transfer in the proposal carries `fromAccount`/`toAccount` by NAME (the card resolves them to ids); an instalment carries `loanName` → `debtAssetId`. | AI-06 |
| A17 | The recurrence in the proposal is `recurring: { frequency, count, day }`, capped at `MAX_RECURRENCE_OCCURRENCES` in the schema; the card prints «N occorrenze, la prima il …». | AI-06 |
| A18 | An explicit categorisation rule becomes a `preference` memory item through today's extractor (one more sentence in its system prompt), no new memory category. | AI-06 |
| A19 | `ChoiceList` (new, `components/ui/choice-list.tsx`) replaces the TWO copies of `ChoiceRows` (Consulente, Compravendita): with the chat it is the third consumer (the Rule of Three). | AI-03 |
| A20 | Motion: the screen transition with `AnimatePresence mode="wait"` on ease-out-quart variants (0.2–0.3 s), a 0.15 s fade under reduced motion; no new spring value (400/35 for what slides); `useCountUp` on the report's figures. AI-01 fixes the details. | AI-01, AI-03 |
| A21 | The AI accent sits on the border, the eyebrow and the glow of what the model wrote (a question card, a proposal card, the active stage of the run), never on button or card fills; the exact places AI-01 writes into DESIGN.md. | AI-01 |
| A22 | The interview is a STAGE after the summary («Colloquio · tornata 1 di 3»), not a ninth screen: «Passo N di 8» stays everywhere, the E2E spec keeps its locators. | AI-04 |
| A23 | Model and effort per session: the table in § 6. | all |

## 5. Order and dependencies

The edges (A → B = «B depends on A»), the same as every spec's header:

| From | To |
|---|---|
| AI-00 | all (the clean repo the series is implemented on) |
| AI-01 | AI-03, AI-04, AI-05, AI-06 (the visual direction and the accent) |
| AI-02 | AI-04 (the interview reads the cashflow block) |
| AI-03 | AI-04 (`ChoiceList`, the new path), AI-05, AI-06 (`ChoiceList`, the accent applied) |
| AI-04 | AI-06 (`lib/utils/questionSet.ts`, `QuestionCard`) |
| AI-05 | AI-06 |

**The specs are implemented ONE AT A TIME, in numeric order, 00 → 06, never two together**: each spec starts from the
diff of the previous one, and a shared module belongs to the lowest-numbered spec that creates it — whoever comes
after uses it under those names, IDENTICAL (§ 7).

## 6. Status

| Spec | Title | Effort | Depends on | Model · effort | Status |
|---|---|---|---|---|---|
| [AI-00](AI-00-dipendenze.md) | Dependency upgrade | S | — | Opus 5.5 · medium | written on 2026-11-01 |
| [AI-01](AI-01-direzione-visiva-consulente.md) | The Consulente's visual direction: three concepts, one choice | M | — | Fable 5.1 · high | written on 2026-11-01 |
| [AI-02](AI-02-blocco-cashflow-consulente.md) | The Consulente's cashflow block | M | AI-00 | Opus 5.5 · high | written on 2026-11-01 |
| [AI-03](AI-03-redesign-percorso-corsa-report.md) | The redesign of the path, the run and the report; `ChoiceList` | L | AI-01 | Fable 5.1 · xhigh | written on 2026-11-01 |
| [AI-04](AI-04-colloquio.md) | The interview: the critical friend before the strategy | L | AI-02, AI-03 | Fable 5.1 · xhigh | written on 2026-11-01 |
| [AI-05](AI-05-assistente-registra.md) | Assistente › Registra: the mode, the context, the proposal, the confirmation | L | AI-03 | Fable 5.1 · xhigh | written on 2026-11-01 |
| [AI-06](AI-06-registra-domande-memoria-ponte.md) | Registra: the detail questions, transfers and instalments, series, memory, the bridge | L | AI-04, AI-05 | Opus 5.5 · high | written on 2026-11-01 |

How the status is marked: «written on …» → «read on … (adversarial reading, N findings, the decisions in § 3)» →
«implemented on …, PR #… in develop since …» → «**retired on …**» with one line of outcome (divergences, defects,
where the lessons went). **The LAST retired spec retires the folder** (WORKFLOW.md § Where things are recorded):
every operational piece of the index goes to ONE home (a rule in AGENTS.md or in the guide, a contract in the code
that carries it), every «decision N» cited in code, tests and guides is rewritten as a dated rule, the series' history
goes to README.md § Documentation.

## 7. Shared contracts (name, signature, file: to be used IDENTICAL)

| Module / symbol | Owner | Later users |
|---|---|---|
| `components/ui/choice-list.tsx` → `ChoiceList`, `ChoiceListOption`, `CHOICE_ROW_CLASS` | AI-03 | AI-04 (the interview), AI-05/06 (the chat), the Compravendita (replacement) |
| The visual direction: DESIGN.md § 5 → **«AI Surfaces»** (the named rules **The AI-Accent Rule**, **The Question-Card Rule**, **The Path-Scene Rule**), `--ai-accent` on both surfaces, the motion tokens | AI-01 | AI-03, AI-04, AI-05, AI-06 |
| `lib/utils/consulenteCashflowContext.ts` → `buildConsulenteCashflowContext(expenses, input)`, `formatConsulenteCashflowForPrompt(ctx)`, `ConsulenteCashflowContext`, `CONSULENTE_CASHFLOW_ROW_CAP` | AI-02 | AI-04 |
| `lib/utils/questionSet.ts` → `Question`, `QuestionOption`, `QuestionAnswer`, `questionSchema`, `questionSetSchema`, `parseQuestionsLenient`, `formatQuestionAnswersForPrompt`, `answerOf` | AI-04 | AI-06 |
| `components/ui/question-card.tsx` → `QuestionCard` | AI-04 | AI-06 |
| `types/allocationAdvice.ts` → `AllocationAdviceInterview`, `AllocationAdviceInterviewRound`, `AllocationAdviceRunStage` with `'interview'`, `AllocationAdviceRunEvent` with `{ type: 'interview' }` | AI-04 | — |
| `types/assistant.ts` → `AssistantMode` with `'register'`, `AssistantMessage.proposals`, `AssistantProposalState` (AI-06 adds `'answered'`), `AssistantRegisterSummary`, the SSE event `{ type: 'register' }` | AI-05 | AI-06 |
| `lib/utils/expenseProposal.ts` → `expenseProposalSchema`, `ExpenseProposal`, `parseExpenseProposal`, `EXPENSE_PROPOSAL_LANGUAGE = 'expense-proposal'`, `proposalKey(kind, index)` | AI-05 | AI-06 (extends the schema: `transfer`, `debt`, `recurring`) |
| `lib/utils/assistantRegisterContext.ts` → `buildAssistantRegisterContext`, `formatRegisterContextForPrompt`, `AssistantRegisterContext`, `REGISTER_RECENT_ROWS_CAP` | AI-05 | AI-06 |
| `components/assistant/ExpenseProposalCard.tsx`, `components/assistant/MessageIdContext.tsx` → `MessageIdProvider`, `useMessageId` | AI-05 | AI-06 |
| `app/api/ai/assistant/threads/[threadId]/messages/[messageId]/route.ts` (`PATCH`), `lib/server/assistant/store.ts` → `setAssistantMessageProposal` | AI-05 | AI-06 |
| `components/expenses/ExpenseDialog.tsx` → prop `initialValues?: ExpenseDialogInitialValues` | AI-05 | AI-06 |
| `lib/utils/questionSet.ts` → `ASSISTANT_QUESTION_LANGUAGE = 'assistant-question'`, `formatQuestionAnswerAsMessage` | AI-06 | — |

## 8. The rules that bind every spec

- **The series' labels never enter the code**: no `AI-04` in a file, function or test name, nor in a comment; a comment
  cites the rule and the date («the interview precedes the strategy, 2026-11-01»), never the spec.
- **Line numbers are dated and carry the commit** (`file:line @ b9411a4d`): earlier specs move them; the implementer
  rereads them and, when the line has moved, searches the function's name.
- **The document limits**: CLAUDE.md is an index (under 20,000 characters; one line per area, one «Latest»); AGENTS.md
  ~1000 lines (a repo-wide rule = RULE + DATE + WHERE PINNED; a guide's stub 3–4 points); a guide ~500 lines (beyond
  that it splits by sub-topic in a session of its own); DESIGN.md is hand-written, never regenerated;
  `Draft Release Temp.md` carries only what the user sees, prepends, never rewrites. **Every document is in English**
  (decision 20): Italian only for quoted UI text, page names and the owner's words.
- **No owner data in a tracked file** (WORKFLOW.md § 1.6): fixtures, mocks, examples and critiques on invented figures
  and generic names; the mirror serves the tour and `npm run mirror:remove` removes it.
- **A probe never opens a control that SPENDS**: the Consulente's run and the Assistente's stream are faked with
  `page.route(...)` (a fake SSE answer) or with `vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream')`; the real run is
  done ONCE, on the mirror, with the owner's key, in phase F.
- **The system prompt is byte-identical for every user**: everything that is the user's (ids, names, rows, answers)
  sits in the `userContent`; a cap either does not exist or is written in the text the model reads.
- **How a spec in service is retired**: the session after its implementation reads the code against the spec, gives a
  verdict on every divergence, carries the lessons home (AGENTS.md, the guide, a comment on the line, CLAUDE.md),
  updates the shared contracts in the LIVE specs that change, then deletes the spec and every pointer; a text-only
  defect is fixed in the retirement with `tsc`, lint and Vitest; a runtime one only on the owner's call, with the
  area's suite and the whole Playwright run. Only the session after that implements the next spec.
- **The guided verification** follows WORKFLOW.md § 2: phases A–G, the expected outcome declared first, the decoys
  («ornitorinco», «fenicottero»), the assertions on the data (Firestore or the HTTP answer), phase F only at the
  owner's «pronto», phase G removing fixtures, mirror and scripts.

## 9. The line for prompt 07 (the next session)

`SERIE = doc/ai/ · INDICE = doc/ai/README.md · SPEC VIVE = AI-00-dipendenze, AI-01-direzione-visiva-consulente, AI-02-blocco-cashflow-consulente, AI-03-redesign-percorso-corsa-report, AI-04-colloquio, AI-05-assistente-registra, AI-06-registra-domande-memoria-ponte`

## 10. What NOT to do (decided on 2026-11-01)

- Not a page of its own under Cashflow to record (decision 5): the Assistente already has threads, memory, streaming, cards.
- Not a new server route to write the row (decision 17): the writer is one.
- Not the interview after the report (decision 4): it improves the INPUT of the expensive run.
- Not the raw transactions to the Consulente (decision 7): an aggregate block with the series.
- Not a ninth screen (A22): the interview is a stage after the summary.
- No write to `allocationAdvice/{uid}` before the strategy (A1).
- No change to `formatBundleForPrompt` or `ASSISTANT_SYSTEM_CORE` for what belongs to ONE mode (A7, AI-05 § 5): the
  core is read by the emails too.
