# AI-06 — Registra: the detail questions, transfers and instalments, recurring series, memory, the bridge

> Series `doc/ai/` (README.md § 5): **depends on AI-04** (`questionSet.ts`, `QuestionCard`) **and AI-05** (the mode,
> the proposal, the card, the persisted state); the last spec: **its retirement retires the folder**. Written on
> 2026-11-01 from `develop` @ b9411a4d. Executes decisions 9 (transfers and instalments), 10, 12, 13 and the adopted
> choices A15–A18. The sentences that must work at the end: «60 euro di benzina, fuori budget» → the card with
> «Fuori dal budget» set; «ho pagato la rata del mutuo» → a `debt` row on the loan; «sposta 500 dal conto principale
> al conto risparmio» → a transfer; «la palestra la metto sempre in Salute» → a memory rule; «abbonamento Netflix 13
> euro ogni mese per un anno» → a 12-row series; «ho pagato 40 euro» → a question «Di cosa si tratta?» with options.

## 1. The problem today (evidence on the code — after AI-05)

- AI-05's protocol knows `expense` and `income` only; a transfer needs `linkedCashAssetId` (origin) and
  `transferCashAssetId` (destination) with `type: 'transfer'` (`types/expenses.ts` `ExpenseFormData`), an instalment
  `type: 'debt'` with `debtAssetId` (the loan; `isDebtPayoff` for an early repayment); a series `isRecurring`,
  `recurringFrequency`, `recurringDay`, `recurringCount` (form-only, «N independent documents», `MAX_RECURRENCE_OCCURRENCES`
  in `lib/utils/recurrenceDates.ts:52`). `createExpenseSettledOnDate` already handles all of them (the dialog's four
  types) — the card only has to pass the form data.
- The model has no way to ASK with options: AI-05's contract says «ask in prose»; the user answers in prose; a
  «which account?» with five accounts is a typing exercise. `questionSet.ts` and `QuestionCard` (AI-04) exist for
  the Consulente's structured output; the chat's channel is markdown text, so a question must travel as a fenced
  block like the proposal.
- Memory items have categories `goal | preference | risk | fact` (`types/assistant.ts:61-75`); the extractor
  (`memoryExtraction.ts`, Haiku 5.5, forced tool `save_memory_items`) reads «preference = preferenze di analisi»
  (`:90`, `:323`) — a categorisation rule («la palestra è Salute») fits `preference` once the extractor is told so
  (AI-05 added the sentence); `formatMemoryForPrompt` already prints active items in every mode.
- The Cashflow › Tracciamento header has the «Aggiungi» button (`ExpenseTrackingTab.tsx:925-937`, `h-11`, hidden in
  portrait below desktop where the FAB stands — `isAddExpenseFabShown`, `navUtils.ts:19`); nothing points at the
  Assistente from there. `/dashboard/assistant?mode=registra` is parsed since AI-05.
- `CURATED_FOLLOW_UPS.register` has AI-05's two chips.

## 2. Goal and acceptance criteria

1. **The proposal schema covers the four kinds** (decision 9): `kind: 'expense' | 'income' | 'transfer' | 'debt'`,
   `type` accordingly (`transfer`, `debt`); a transfer carries `fromAccount` and `toAccount` **by NAME** (A16) which
   `resolveExpenseProposal` maps to ids (ambiguous or unknown → a problem, «Conferma» disabled, the card says which);
   an instalment carries `loanName` → `debtAssetId` (the loans = `isRepayableDebt(asset)`, the dialog's filter
   `ExpenseDialog.tsx:1508`) and `payoff?: boolean`; `fee?: { amount, categoryId }` on any row (the shared fee rule);
   `recurring?: { frequency: 'monthly' | 'yearly'; count: number; day?: number }` (A17) with `count ≤ MAX_RECURRENCE_OCCURRENCES[frequency]`
   in a `superRefine`. Proof: `expenseProposal.test.ts` extended (a transfer without `toAccount` rejected; a count
   over the cap rejected; the kind/type refine for the four kinds).
2. **The card renders the four kinds as the Tracciamento feed does** (a transfer «Conto principale → Conto
   risparmio», an instalment «Rata · Mutuo casa», «Estinzione anticipata» for a payoff, the fee line, «N occorrenze
   mensili, la prima il DD/MM/YYYY» for a series) and writes them through the same mutation (`createExpenseSettledOnDate`
   handles the pair, the series, the fee; `applyDebtRepayments` the instalments); the card's «Registrata» names
   the count («12 righe registrate») and links the first. Proof: RTL per kind; E2E per kind on the emulators with
   the Admin assertions (the transfer moves TWO balances; the instalment lowers the loan's principal; the series
   writes N documents with `recurringParentId`).
3. **The question protocol** (A15, decision 10): `ASSISTANT_QUESTION_LANGUAGE = 'assistant-question'` in
   `questionSet.ts`; a fenced block holds ONE `Question` (the AI-04 schema; `kind` single/multiple; options with
   `value` = an id when the question is about accounts/centres/members, the label the name); at most two blocks per
   message (the parser keeps the first two, logs the rest); the `pre` interceptor renders `QuestionCard` with
   `ChoiceList` (an account question with > 4 accounts: the schema caps options at 4 — the contract tells the model to
   offer the 3 most likely + «Altro…» and the card's «Altro» row opens a `Select` of ALL accounts when the question's
   `id` starts with `account:`; the same for `center:`, `member:`); answering posts a user message
   `formatQuestionAnswerAsMessage(question, answer)` («Conto: Conto risparmio [id]» — the id in brackets so the
   model copies it) through the normal `sendMessage`, and the model re-proposes. The answered card persists its
   state in `proposals` under `proposalKey('question', index)` with `status: 'answered'` (the state union gains it).
   Proof: `questionSet.test.ts` (the message format, the two-block cap), RTL (`Select` reveal on `account:`), E2E
   (faked stream with a question → answer → the spec asserts the POSTed body of the next stream request is the
   formatted answer).
4. **The contract tells the model WHEN to ask** (decision 10 «only when they are needed»): the account when no
   default exists for the kind or the user named none and the recent rows of that category used ≥ 2 accounts; the
   centre only when `costCentersEnabled` and the recent rows of that category were booked in a centre at least once;
   the member only when `expenseSplitEnabled` and the category's rows are mostly personal; «fuori budget» never
   asked, only applied when the user says it or the recent rows of that category are mostly `excludeFromBudget`;
   «Di cosa si tratta?» when the amount comes with no noun; never more than two questions per message; never a
   question whose answer is in the recent rows or in memory. Proof: `assistantPrompts.test.ts` snapshot of the
   contract's sentences; the owner's phase F.
5. **The memory rules** (decision 13, A18): a user sentence that states a rule becomes a `preference` item
   «Categorizzazione: la palestra → Salute › Palestra» through the extractor (AI-05's sentence + a second one
   giving the format); `formatMemoryForPrompt` is unchanged (it prints every active item); the REGISTER_CONTRACT says
   «le regole di categorizzazione in memoria vincono sullo storico». The memory panel shows them under «Preferenze»
   as today. Proof: `memoryExtraction.test.ts` with a mocked Haiku answer; `assistantPrompts.test.ts`.
6. **The recent-rows block gains the learning columns** (decision 13): per category, the share of rows per account,
   per centre, per member, `excludeFromBudget` (a one-line «pattern» under each category: «Cibo › Spesa: 24 righe,
   Conto principale 96%, mai in un centro, in comune, nel budget»), computed by `buildAssistantRegisterContext`
   (pure) and printed before the rows. Proof: `assistantRegisterContext.test.ts`.
7. **The Cashflow bridge** (decisions 5, 16): a secondary button «Chiedi all'Assistente» (`MessageSquarePlus`,
   `h-11`, outline, hidden in demo and when `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` is off — the same gate as the page,
   read through the existing `isAssistantEnabled` helper if one exists, else `process.env.NEXT_PUBLIC_…` in a
   `lib/utils/assistantFlag.ts`) next to «Aggiungi» in `ExpenseTrackingTab`'s axis, `href="/dashboard/assistant?mode=registra"`;
   on portrait phones it sits in the «Altro» sheet? No — it follows «Aggiungi»'s own rule (`max-desktop:portrait:hidden`;
   the FAB is the one add control there). Proof: E2E desktop sees the link and lands in the mode; the mobile spec
   does not see it in portrait.
8. **Follow-ups**: `CURATED_FOLLOW_UPS.register` = «Registra una spesa di oggi», «Registra lo stipendio», «Sposta
   soldi fra due conti»; after a written card the follow-ups row offers «Registra un'altra» (a chip that focuses
   the composer). Proof: the follow-ups test.
9. **Nothing of AI-05's behaviour regresses**: its E2E and suites green.

## 3. Decisions

- **Decisions 9, 10, 12, 13 (owner)**; **A15–A18 (adopted, reversible)**.
- **Adopted, reversible**: a question's answer is a USER MESSAGE (A15) rather than a hidden field: the thread reads
  as a conversation, the model sees the answer in the history under the normal cap, and nothing new is persisted
  besides the card's `answered` state.
- **Adopted, reversible**: the account/centre/member questions carry ids as option values; the `Select` fallback
  for > 4 lists all items (ids from the page's hooks, not from the model).
- **Adopted, reversible**: a transfer's fee goes on the origin account (the shared fee rule: «the fee on any row»),
  category = `settings.transferFeeCategoryId` when the proposal omits `fee.categoryId`.
- **Adopted, reversible**: a series' first date = `dateIso`, `recurringDay` = its day unless the proposal says
  otherwise; the card prints the first and the last occurrence (`recurrenceDates`' helpers).
- **Adopted, reversible**: the bridge is a LINK (navigation), not a modal: the chat needs its page (threads,
  memory, the panel).
- **Adopted, reversible**: «Registra un'altra» is a follow-up chip, not a button in the card (the card is a record;
  the composer is where the next sentence goes).

## 4. Solution

### Schema extension (`lib/utils/expenseProposal.ts`, the AI-05 contract extended in place)

```ts
export const expenseProposalSchema = z.object({
  kind: z.enum(['expense', 'income', 'transfer', 'debt']),
  type: z.enum(['fixed', 'variable', 'income', 'transfer', 'debt']),
  amount: …, dateIso: …,
  categoryId: z.string().min(1),              // every kind, a transfer too: a `transfer`-type category, as the dialog requires
  subCategoryId: …, accountId: …, costCenterId: …, memberId: …, excludeFromBudget: …, note: …, reason: …,
  fromAccount: z.string().min(1).max(80).optional(), toAccount: z.string().min(1).max(80).optional(),
  loanName: z.string().min(1).max(80).optional(), payoff: z.boolean().optional(),
  fee: z.object({ amount: z.number().positive(), categoryId: z.string().min(1).optional() }).optional(),
  recurring: z.object({ frequency: z.enum(['monthly', 'yearly']), count: z.number().int().min(2), day: z.number().int().min(1).max(31).optional() }).optional(),
}).superRefine((p, ctx) => {
  const kindType: Record<typeof p.kind, string[]> = { expense: ['fixed', 'variable'], income: ['income'], transfer: ['transfer'], debt: ['debt'] };
  if (!kindType[p.kind].includes(p.type)) ctx.addIssue({ code: 'custom', message: 'kind/type disagree' });
  if (p.kind === 'transfer' && (!p.fromAccount || !p.toAccount)) ctx.addIssue({ code: 'custom', message: 'transfer needs both accounts' });
  if (p.kind === 'debt' && !p.loanName) ctx.addIssue({ code: 'custom', message: 'debt needs loanName' });
  if (p.recurring && p.recurring.count > MAX_RECURRENCE_OCCURRENCES[p.recurring.frequency]) ctx.addIssue({ code: 'custom', message: 'too many occurrences' });
});
```

`resolveExpenseProposal` grows: account names resolved case-insensitively against the cash assets (exact first,
then `startsWith`, then `includes`; two hits = ambiguous); the loan by name among `isRepayableDebt` assets
(`lib/utils/mortgageRepayment.ts:197`); the transfer's category is a `transfer`-type category the model picks from the
block (the context prints categories by type; there is no transfer-category setting — only `transferFeeCategoryId`
for the FEE, `types/assets.ts:397`); `recurring` → `isRecurring`, `recurringFrequency`, `recurringCount`, `recurringDay`.

### `questionSet.ts` additions (AI-04's module)

```ts
export const ASSISTANT_QUESTION_LANGUAGE = 'assistant-question';
export const ASSISTANT_QUESTION_MAX_PER_MESSAGE = 2;
export function parseAssistantQuestion(raw: string): Question | null;             // one block = one question
export function formatQuestionAnswerAsMessage(question: Question, answer: QuestionAnswer['value'], labels: Record<string, string>): string; // «Conto: Conto risparmio [id]»
export function isEntityQuestion(question: Question): 'account' | 'center' | 'member' | null; // by id prefix
```

### Contract (prompts.ts, `REGISTER_CONTRACT` extended)

The four kinds with their fields and examples; the transfer by names; the instalment by loan name («RATE DI PRESTITO»
block in the context: the loans with name and `[id]`, monthly instalment median from the recent rows — the pure
builder adds it); the recurrence; the WHEN rules of criterion 4; the question block's schema and the two-block cap;
«le regole di categorizzazione in memoria vincono sullo storico»; «dopo la risposta a una domanda, riproponi la riga
intera, non chiedere ancora».

### Client

- `AssistantStreamingResponse.tsx`: the `pre` interceptor's third language; `QuestionCard` with
  `eyebrow="L'Assistente chiede"`, a «Rispondi» button (44px) under the card (the Consulente's round-level button
  does not fit a single card: here one card = one answer), the `Select` reveal for entity questions, the
  `answered` state from `proposals`.
- `ExpenseProposalCard.tsx`: the four kinds' rendering and labels; the counts in the written state.
- `ExpenseTrackingTab.tsx`: the bridge button; `lib/utils/assistantFlag.ts` if needed.
- `assistantFollowUps.ts`: the chips.
- `memoryExtraction.ts`: the format sentence.

## 5. Constraints and traps («here it means that»)

- **The fee rule (`doc/guide/cashflow.md`)** — the fee is a row of its own in the same batch; the card never writes
  two separate calls.
- **The instalment that repays a loan / the payoff** (cashflow.md) — `applyDebtRepayments` is called after the write,
  exactly as the dialog does; `isDebtPayoff` through the proposal's `payoff`.
- **The transfer onto a property** (cashflow.md) — not in scope: a transfer is between two CASH accounts; the schema
  has no `propertyAssetId` (declared in § 10).
- **`MAX_RECURRENCE_OCCURRENCES`** — the schema's cap is THE constant, not a copy.
- **The system prompt's silent caps** — «al più due domande per messaggio» and «3 opzioni + Altro per i conti» are
  in the contract's text.
- **a11y** — the `Select` fallback is a labelled `Select` (`FIELD_HEIGHT_CLASS`), the question's text is the group
  name; the «Rispondi» button is the card's only button.
- **Demo** — the bridge hidden; «Rispondi» still works (it only posts a message) but the stream is demo-blocked
  already by the page.
- **`isAddExpenseFabShown` is the ONE rule for the FAB** — the bridge does not touch it; the bridge follows
  «Aggiungi»'s visibility classes.
- **No owner data** — E2E loans «Mutuo ornitorinco», accounts «Conto A/B», amounts 12.34.

## 6. Tests per level (with the mutation that proves each)

- `expenseProposal.test.ts`: the refine matrix (4 kinds × wrong type), the transfer/debt requirements, the
  recurrence cap, `resolveExpenseProposal` for names (exact/ambiguous/unknown), the loan, the fee's default category.
  Mutation: `includes` before exact match → «Conto» matches two → the exact test fails.
- `questionSet.test.ts`: `parseAssistantQuestion`, the message format with the id, `isEntityQuestion`, the two-block
  cap in the interceptor's helper. Mutation: drop the id from the message → fails.
- `assistantRegisterContext.test.ts`: the pattern lines, the loans block. Mutation: shares computed over all rows
  instead of the category's → fails.
- `assistantPrompts.test.ts`: the contract snapshot; the core unchanged.
- `memoryExtraction.test.ts`: the mocked tool call yields a `preference` with the format.
- `assistantFollowUps.test.ts`: the three chips.
- RTL: `ExpenseProposalCard` per kind; `QuestionCard` in the chat (the `Select` reveal, the «Rispondi»).
- **E2E** `e2e/assistant.register.kinds.spec.ts` (desktop): four faked proposals, four confirms, four Admin
  assertions; `e2e/assistant.register.question.spec.ts`: the question → the posted answer; `e2e/cashflow.tracciamento.spec.ts`
  (existing, extend): the bridge link; the mobile spec: hidden in portrait.

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the nine criteria; the outcome «the six sentences of § 0 each end in the right card or question, and the
  rows land as the dialog would write them».
- **B**: the contract's WHEN rules and the question copy read with the owner.
- **C**: `tsc`, lint, both-zone Vitest, the four E2E specs, `perf:budget`.
- **D**: the emulator's rows (two balances for a transfer, the loan's principal, N series documents).
- **E**: screenshots of a question card with the `Select` open, a transfer card, a series card, the bridge at 1280
  and its absence at 390 portrait.
- **F**: the owner, on the preview with the owner's key, runs the six sentences; judges when the assistant asks
  and when it does not; states a rule («la palestra è Salute») and, in a new thread the next minute, checks the
  rule is applied and visible in the memory panel. The test rows deleted by the owner after.
- **G**: scripts, screenshots removed; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

Branch `feat/assistente-registra-dettagli`, commit `feat(assistente): Registra asks the details, moves money,
repays loans, repeats rows, remembers rules; the Cashflow bridge`, PR to `develop`. No flag.

## 9. Documentation

- `doc/guide/assistente.md` § Registra: the four kinds, the question protocol, the WHEN rules, the memory rules,
  the patterns block; § Per-page blind spots: «a question is answered by a message: the thread shows it», «an
  entity question offers three options; the Select holds all», «a rule in memory beats the history».
- `doc/guide/cashflow-tracciamento.md`: the bridge (where, when hidden).
- `doc/guide/cashflow.md` § shared expense rules: one line «the Assistente's card writes through the same services:
  every rule here holds there».
- AGENTS.md § Assistente stub: «questions travel as ```assistant-question blocks, one per block, at most two (2026-11)».
- CLAUDE.md § Key Features › Assistente AI: the sentence completed («… asks the details, transfers, instalments,
  series»); § Cashflow › Tracciamento: «+ the bridge to the Assistente».
- `Draft Release Temp.md`: the user-facing lines.
- **The retirement of this spec retires `doc/ai/`** (README.md § 6): every decision cited in code/tests/guides
  becomes a dated rule; the series' history goes to README.md § Documentation; `doc/ai/reference/` is deleted with the
  folder (the chosen concept lives in DESIGN.md).

## 10. Declared out of scope

- A transfer onto a property (`propertyAssetId`): heir CLAUDE.md § Not yet present («Registra moves money between
  cash accounts only»).
- Editing/deleting rows from the chat: heir CLAUDE.md § Not yet present (from AI-05).
- Voice input, receipts: heir CLAUDE.md § Not yet present.
- A per-user «always ask the account» preference: heir CLAUDE.md § Not yet present («Registra's asking policy is
  the contract's, not a setting»).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Assistente, § Cashflow, § Query keys, § React Compiler, § a11y), DESIGN.md § 5 «AI
Surfaces», doc/guide/assistente.md, doc/guide/cashflow.md (le regole condivise: commissione, rata, estinzione),
doc/guide/cashflow-tracciamento.md, doc/guide/e2e-emulatori.md, doc/ai/README.md § 3-4-7,
doc/ai/AI-06-registra-domande-memoria-ponte.md e i diff di AI-04 e AI-05 (in develop). Implementa AI-06 così com'è
scritta: lo schema esteso in expenseProposal.ts con il superRefine della § 4, i nomi risolti a id nella card, il
protocollo ```assistant-question su questionSet.ts e QuestionCard (contratti di AI-04, identici), le regole QUANDO
nel contratto, le righe «pattern» nel contesto puro, la frase per l'estrattore, il ponte in ExpenseTrackingTab con
la visibilità di «Aggiungi», i follow-up. Vitest in entrambe le zone, le quattro spec Playwright con lo stream
SEMPRE finto e le asserzioni Admin sui dati. Collaudo: § 7; le sei frasi sul preview al mio «pronto». Un branch, un
commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **high** (the contracts exist; the work is extension and tests). Estimated size: 1 long
session, ~5 h; ~150 lines of schema/resolve, ~80 `questionSet`, ~120 of contract text, ~200 client, ~400 tests, four
E2E touches.
