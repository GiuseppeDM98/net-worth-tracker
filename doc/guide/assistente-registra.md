# Assistente › Registra

> **When to open this guide** — whoever touches the Assistente's `register` mode: the proposal card, the questions,
> the register block, the write on «Conferma», the PATCH of a card's outcome, the Cashflow bridge. Split from
> `doc/guide/assistente.md` on 2026-11-16 (the guide had passed 500 lines); the rest of the Assistente — the modes, the
> prompts, the stream, the router, the goals, the page — stays there. E2E: the five `e2e/assistant.register*.spec.ts`.

## Files

- **Registra** (2026-11): pure `lib/utils/{expenseProposal,assistantRegisterContext,assistantStreamBuffer,assistantQuestionBlocks}.ts` (the question helpers in `lib/utils/questionSet.ts`), `components/assistant/{ExpenseProposalCard,MessageIdContext,RegisterRefsContext,AssistantQuestionBlock,MessageQuestionsContext}.tsx`, `components/assistant/tiles/RegistraContestoTile.tsx`, `app/api/ai/assistant/threads/[threadId]/messages/[messageId]/route.ts` (the PATCH of a card's outcome), `fetchRegisterInputs` in `assistantMonthContextService.ts`, `ExpenseDialog`'s `initialValues` (doc/guide/dialog.md), `parseCashflowMonthParam` in `lib/utils/period.ts`. Suites: `expenseProposal`, `assistantRegisterContext`, `assistantStreamBuffer`, `assistantQuestionBlocks`, `questionSet`, `assistantQuestionBlock` (`.test.tsx`), `assistantFollowUps`, `assistantMessageRoute`, `expenseProposalCard`, `goalProposalCard`, `assistantStreamingResponse`, `assistantComposer`, `useAssistantStreaming`, `expenseDialogInitialValues`, `assistantCompanionScene`, `assistantHeader` (the last eight `.test.tsx`), and the five E2E specs with the emulators up.

## Registra (2026-11)

«Ho fatto spesa per 103 euro» becomes a card; «Conferma» writes the row through the expense form's services (a series
or a fee: the form's batch of documents); a reload never writes it twice. Since 2026-11-11 also transfers (onto a house too), instalments, series, fees and new categories,
and the Assistente asks what it needs with options before proposing.

- **The mode** is `register`, handled EXPLICITLY at every site of the WARNING comment that opens `types/assistant.ts`
  (the true list; none falls through to chat). It has no period: the stream body carries no month, the context route
  answers 400, `useAssistantPeriodContext` is never enabled, there is no axis to show it on (2026-11-12), web search is
  off whatever the prompt says. The stream body is validated by `assistantStreamRequestSchema` (zod, every field; the
  prompt stops at 4000 characters in EVERY mode, the composer counts from 3800 by `aria-describedby`).
- **The register block** (`buildAssistantRegisterContext` → `formatRegisterContextForPrompt`, pure, `userContent`):
  today's Italian date, the categories and sub-categories, the cash accounts with balance and default roles, the
  centres and the members — all BY ID, uncapped — and the rows of the window from the first Italian day of the month
  eleven months back to the end of today, newest first, a recurring series as ONE row with its count, cut at 300 with
  the cut printed. **IL MESE** has two sources: the totals are the Panoramica's server summary (`getDashboardOverview`),
  the spending by type and the budget lines (20 at most, printed; a budget on a type under the type's label, «Spese
  Necessarie») come from the window's rows through the Budget's pure
  level. The two reads of the month are settled apart: a failed one prints its sentence, the core reads failing is a 500
  before any event. The CASHFLOW 12 MESI block follows, as in every mode.
- **The protocol** lives ONLY in `buildRegisterPrompt` (`REGISTER_CONTRACT`; `ASSISTANT_SYSTEM_CORE` is untouched and the
  mode's `system` is byte-identical between users — held by `not.toContain` and `toBe`): up to five
  ```expense-proposal blocks a message (`EXPENSE_PROPOSALS_MAX_PER_MESSAGE`; a sixth renders as code), `expenseProposal.ts`
  the ONE schema. A block's key is `expense:N`, N its rank among the message's blocks of that language, DERIVED from the
  markdown (`listFencedBlocks`, matched by the `pre` node's offset) — never counted in render.
- **The four kinds** (2026-11-11, `expenseProposalSchema` and its `superRefine`): `kind` expense · income · transfer ·
  debt, `type` the row type of its kind. A **transfer** names `fromAccount`/`toAccount` (an id first, then the name:
  exact → starts with → contains, the first stage with hits decides; «ambiguo: …» / «conto sconosciuto: …»), searched among
  the cash accounts AND the houses (`isTransferableProperty`); a house sits on one side only, the card says «verso
  l'immobile X: il valore della casa sale di …» or «… scende di …», refused above `propertyValueAvailable`; no category
  needed (the named transfer one, else the first, else «Trasferimenti (nuova)», created on «Conferma»). An **instalment**
  names `loanName` among the repayable debts (`isRepayableDebt`), matched as an account is («prestito ambiguo: …» /
  «prestito sconosciuto: …»; two loans a name does not tell apart are asked first, «Quale prestito?», a `loan:`
  question), and shows the principal / interest split (`splitInstalment`); no `loanName` is «Rata non collegata a un prestito»; `payoff` is all principal, one row. A
  **series** (`recurring`: monthly or yearly, count up to `MAX_RECURRENCE_OCCURRENCES`, `canTypeRecur`: expenses and
  instalments only) reads «12 occorrenze mensili, dal … al …» and writes the dialog's documents of one parent. A **fee**
  (`fee.amount`) goes in the category of Impostazioni › Spese (`resolveExpenseFeeCategory`), never the model's; with none
  set the card links Impostazioni. A field that does not belong to the row is dropped and said («ignorato: intestatario»,
  «… fuori budget», «… commissione»).
- **New categories are written BEFORE the row** (2026-11-11): `newSubCategory` under an existing category (reused by
  its trimmed name, else appended to a FRESH read of the category, `newSubCategoryId` the one id rule with the dialog and
  the import), `newCategory` alone (reused when its `categoryMatchKey` exists — the key lives in
  `lib/utils/expenseCategoryMatching.ts`, NOT `expenseImport.ts`, whose papaparse cost the page 8 KB). A retry after a
  failed row reuses what it created (`createdRef`).
- **Questions** (2026-11-11, DESIGN.md → The Question-Card Rule): a ```assistant-question block holds ONE question
  object, read by `parseQuestionsLenient([obj])` (the one parser) plus `entityQuestionProblems`; at most
  `ASSISTANT_QUESTION_MAX_PER_MESSAGE` (2) a message, never beside a proposal of the same message (a card in a message
  with a question reads «Rispondi prima alla domanda», «Conferma» closed). An entity question (`account:`, `center:`,
  `member:`, `loan:`, `category:` before the first «:») takes `allowOther: true`, three options at most (a category
  more), no «Preferisco non dire»; its «Altro…» is a `Select` of the page's own items (the houses as «X (immobile)» on
  `account:from`/`account:to`). ONE «Rispondi» under the message's last card, on the thread's LAST assistant message, saved,
  nothing streaming (`isAnswerableQuestionMessage`); it saves every answer on the message (`question:N`, `answered`,
  the label), then sends ONE user message, one line per question — «{domanda} → {scelta} [id]» for an entity. An older
  question reads «Non risposta qui». **A submit from an older render starts from the buffer** (`useAssistantStreaming`,
  2026-11-11): «Rispondi» records, then calls the `submit` of the render it was clicked in, whose `renderedMessages`
  predates the answers — the buffer (or the cached thread, when it is empty) is the base; the E2E spec showed the
  answered cards as «Non risposta qui».
- **When to ask, and the block's three lines** (the contract's «QUANDO CHIEDERE»): the account only if the user named
  none AND (no default for the type OR the category's most used account covers under 80% of its rows); the member only
  with the Divisione on and at least half the category's rows personal; the cost centre only with the centres on and at
  least one of the category's rows in a centre over the last 12 months; «fuori budget»
  applied, never asked, when the user says it or half the category's rows are; an amount with no object asks «Di cosa si
  tratta?». The register block feeds it: **PATTERN** per category over the window (the most used account and its share,
  rows in a centre, the personal and out-of-budget shares, each clause only with its feature on; fee rows and transfers
  out), **PRESTITI** (debt, TAN, the median instalment of the recent rows, a series counted once) and **IMMOBILI**
  (`[id] nome · valore`), after CONTI. **The proposal's rules defer to these thresholds** (2026-11-11, the retirement of
  the Registra details): the first contract's «the default account, unless the user names another», «a centre or a
  member only when the user names it» and «fuori budget only when the user says it» contradicted them; the account is
  now the one named or picked in an answer, else the default when QUANDO CHIEDERE does not ask, the centre and the
  member the named or picked one, «fuori budget» what QUANDO CHIEDERE applies, and the opening names transfers and
  instalments — every sentence held whole in `assistantPromptBundle`, each seen red. The way in reads «Registra un
  movimento» and the composer «Scrivi cosa hai speso, incassato o spostato…» since the same day.
- **The card** (`ExpenseProposalCard`): `resolveExpenseProposal` checks every id against the browser's own reads
  (`RegisterRefsContext`: categories, assets, settings, centres) and names what it cannot find — a problem closes
  «Conferma», never «Modifica»; a failed read closes all writing. States (`describeExpenseProposalState`): idle ·
  saving (the first click closes the button: a double click writes one row) · «Registrata · apri in Cashflow»
  (`/dashboard/cashflow?tab=tracking&month=YYYY-MM&row=<id>`: the ROW's month and the row itself, on which Tracciamento
  lands — doc/guide/cashflow-tracciamento.md § Files; the month is the one the row was SAVED in, kept on the outcome
  as `month` when «Modifica» moved the date out of the proposal's, 2026-11-11) · «Ignorata» · «Risposta interrotta: chiedi di
  riproporla» on a message whose id is still `local-` (no buttons). The focus moves to the outcome line; no new live region
  but the write error's (`role="alert"`). The three 44px buttons wrap (`flex-wrap`, held by `expenseProposalCard`'s
  «offers three 44px buttons that wrap»).
- **The write** is the expense form's create path, in the browser: `createExpenseSettledOnDate` → `applyDebtRepayments` →
  `applyBalanceEffects` (a future date is a pending row, the balance moves on its day — the card says
  when only if the row has an account), then four invalidations
  (`expenses.all`, `assets.all`, `dashboard.overview`, `costCenters.all`). No server route writes a row. «Modifica»
  opens `ExpenseDialog` on the proposal (`initialValues`, lazy — `lazyComponent`, preloaded on hover and focus) and the
  row the form saves is the card's outcome.
- **The outcome is saved on the message**: `proposals["expense:0"] = { status, writtenIds, at }` (a series or a fee
  writes several ids: «12 righe registrate», «+ 1 commissione») through
  `PATCH /api/ai/assistant/threads/[threadId]/messages/[messageId]` (`update` with a `FieldPath`, never a merge), after
  it was written into the stream buffer and the cached thread (`recordProposal`: the buffer wins until a thread switch).
  The stream's `done` carries the assistant message's id, adopted by the buffer (`adoptStreamMessageId`). The goal card
  uses the same path (`goal:N`) and, since 2026-11-11, the same two rules: no button on a `local-` message, and a
  toast when the save fails after the write (`GOAL_STATE_NOT_SAVED`, beside `PROPOSAL_STATE_NOT_SAVED`). An outcome
  never scrolls the conversation (`conversationScrollSignal`, held in the browser by the two-card spec).
- **The way in** (2026-11-12): a written sentence read as a registration — the router's `register` intent, or
  «cambia» → «Un movimento da registrare» → «Rileggi». There is no mode to enter or leave, no strip, no day thread:
  a registration goes into the open conversation like any message, the cards follow the MESSAGE's `mode` (an answer
  after a registration is shown as one: verdict, companion, the register reads). `?mode=registra` (the two Cashflow
  links) is read once, after the thread list and outside the demo: it puts the three register suggestions first,
  focuses the composer and is dropped from the URL. The open thread is `?thread=<id>`, so a Back from Cashflow
  reopens the thread it left (the second «Registrazioni» of the same day, 2026-11-11, cannot happen: no thread is
  looked up by day). «Nuova conversazione» is on whenever nothing streams.
- **The answer is short, whatever the style preference** (the owner's tour, 2026-11-11): the first real answers carried
  «Ipotesi che ho fatto», «Cosa dicono i dati del mese» and «Limiti dei dati» under the cards (the «deep» style line of
  `userContent` asks for hypotheses and limits) and said «vedo solo le 300 righe più recenti su N». `REGISTER_CONTRACT`
  now says: one sentence, the blocks, then only what the user needs to decide (a row not proposed and why, one sentence on
  the category's budget; since 2026-11-11 a real doubt — on the category, the account, the PROPERTY, the member or the
  loan — is a question block in a message WITHOUT proposals, never a prose question under the cards; «immobile» joined
  the list after the owner's tour, where a deposit «sulla casa» became a spending row in Compravendita with «dimmelo e
  la imposto come trasferimento» under it), no titled sections, nothing the card already shows, and
  never the rows' cut unless the user asks for a row it cannot find. The 300 cap stays (the owner's choice).
- **A card's outcome never moves the page** (2026-11-11): the conversation follows `conversationScrollSignal` (thread,
  count, the last message's length — `assistantStreamBuffer.ts`), not the message list's identity, which a recorded
  outcome renews; «Conferma» or «Ignora» on a card in the middle of an answer used to send the page to its bottom.
- **The verdict and the panel**: `buildRegisterVerdict(summary)` — computed from the browser's reads before any
  message, from the stream's `register` event after («le ultime N righe» is the server's alone); `RegistraContestoTile`
  («Cosa conosce l'Assistente») lists the accounts, their default roles and what was read. Neither wears the accent.
- **E2E**: the spec fakes the stream and does what the route does around the model (thread and messages written with
  the Admin SDK, `done` with the planted id), so the PATCH and the reload run on the real routes. The page needs the key
  in `.env.local` to render the composer; no request reaches a model (doc/guide/e2e-playwright.md).

## Per-page blind spots

- **A row written from Registra carries no mark**: in Tracciamento it is a row like any other — and never «Legata all'immobile»: «Modifica» sets it.
- **A question is answered by a message** (2026-11-11): the thread shows the answer lines as the user's message, and the read-only cards above it.
- **What Registra does not do** (owner, 2026-11-01): it never edits or deletes an existing row (the writer is the
  card's «Conferma», once, through today's services — never a new server route); no receipt attachments and no voice;
  no per-user «always ask the account» setting (the asking policy is the contract's thresholds); it is a mode of the
  Assistente, never a page under Cashflow; what belongs to ONE mode never enters `formatBundleForPrompt` or
  `ASSISTANT_SYSTEM_CORE`, which the emails read too.
- **The Cashflow bridge reads the key at build, as this page does**: `app/dashboard/cashflow/page.tsx` passes `Boolean(process.env.ANTHROPIC_API_KEY)`; a key added on Vercel shows «Chiedi all'Assistente» after the next deploy.
- **IL MESE's totals are as fresh as the Panoramica's summary** (2026-11): the first line is the server summary, the lines under it are computed from the rows read for the message; a row written outside the app's services (an Admin write, a restore) leaves the two apart until the summary is rebuilt — seen on the emulator after a spec's Admin deletes.
- **Registra adds about 25 KB gz to the page's first load** (2026-11-10, the ceiling raised with the owner's OK: doc/guide/velocita.md § Registro): the card's services, the protocol and the four reads ship with the page; only `ExpenseDialog` is lazy. Loading the three write services on «Conferma» was measured at −0,9 KB and dropped. The questions and the four kinds added 13,3 more on 2026-11-11 (738,1 → 751,4, ceiling 753).
