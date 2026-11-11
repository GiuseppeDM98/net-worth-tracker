# AI-06 — Registra: the detail questions, the four kinds, series, new categories, memory rules, the bridge

> Series `doc/ai/` (README.md § 5): **depends on AI-04** (retired on 2026-11-08, in develop since 2026-11-08, PR #509: `questionSet.ts`, `parseQuestionsLenient`, `describeAnswer`,
> `QuestionCard` with `decline` and `otherSelect`) **and AI-05** (retired on 2026-11-11, in develop since 2026-11-11, PR #512: the mode, the proposal protocol, `listFencedBlocks`,
> `proposalKey`, `resolveExpenseProposal`, `describeExpenseProposalState`, `ExpenseProposalCard`, `MessageIdContext`,
> `RegisterRefsContext`, the persisted `proposals` with `month?` on a written row, the helper `e2e/assistantRegister.ts`); the last spec: **its retirement retires the folder**. Written on
> 2026-11-01
> from `develop` @ b9411a4d. Executes decisions 9, 10, 12, 13, the adopted choices A15–A18 (A15 as amended by decision
> 64, A16 by decisions 31 and 66) and decisions 21, 29–32, 38, 40, 64–73. § 4 Client is written for a conversation
> column with cards, the Assistente's concept B «La scena» (decision 74, 2026-11-06; the conditional of decision 37
> settled); the bridge's accent removed on 2026-11-06 at AI-01's retirement (decision 78), to be reread there. The sentences that must work at the end: «60 euro di benzina, fuori budget» → the
> card with «Fuori dal budget» set, nothing asked; «ho pagato la rata del mutuo» → a `debt` row on the loan with its
> principal and interest line (with two loans the name does not tell apart: «Quale prestito?»); «sposta 500 dal conto
> principale al conto risparmio» → a transfer that moves two balances; «ho versato 2000 euro di caparra sulla casa dal
> conto principale» → a transfer onto the property, «verso l'immobile …: il valore della casa sale di 2.000,00 €»;
> «abbonamento Netflix 13 euro ogni mese per un anno» → a 12-row series, «12 occorrenze mensili, dal … al …»; «ho
> pagato 40 euro» → the question «Di cosa si tratta?» with options; «35 euro per il corso di ceramica» with no
> subcategory that fits → «Nuova sottocategoria: Svago › Ceramica»; «la palestra la metto sempre in Salute» → a memory
> rule, and «d'ora in poi la palestra va in Sport» archives it. Read adversarially on 2026-11-01: 39 findings applied,
> the decisions 21–73 in README.md § 3 (this spec: decisions 21, 22, 29, 30, 31, 32, 36, 37, 38, 39, 40, 58, 63, 64, 65,
> 66, 67, 68, 69, 70, 71, 72, 73).

## 1. The problem today (evidence on the code — after PR #512, in develop since 2026-11-11)

- **PR #512's protocol knows `expense` and `income` only.** A transfer is `type: 'transfer'` with `linkedCashAssetId`
  (origin) and `transferCashAssetId` (destination) (`types/expenses.ts` `ExpenseFormData`); either end may be a
  PROPERTY: the dialog offers the cash accounts and `allAssets.filter(isTransferableProperty)` as endpoints
  (`components/expenses/ExpenseDialog.tsx:1502` @ ce26af4d; `isTransferableProperty` = `realestate` type and class at
  price 1, `lib/utils/propertyTransfer.ts:22` @ ce26af4d), a property on one end only, and refuses a sale above the
  property's value (`propertyValueAvailable` `:31`, `exceedsPropertyValue` `:41` @ ce26af4d,
  `describePropertyTransferRefusal` `lib/utils/dialogNarrative.ts:1134` @ ce26af4d). An instalment is `type: 'debt'`
  with `debtAssetId` (the loans = `isRepayableDebt`, `lib/utils/mortgageRepayment.ts:197` @ b9411a4d, the dialog's
  filter `ExpenseDialog.tsx:1508` @ b9411a4d) and `isDebtPayoff`; the dialog allows a `debt` row with no loan
  («__none__», `:2025` @ ce26af4d). The split of an instalment is `splitInstalment(instalment, debt, annualRatePct,
  isPayoff)` (`mortgageRepayment.ts:91` @ ce26af4d) and its sentence `describeDebtRepaymentField(facts)`
  (`dialogNarrative.ts:1158` @ ce26af4d).
- **A series recurs only for spending and instalments**: `RECURRING_EXPENSE_TYPES = ['fixed', 'variable', 'debt']`
  and `canTypeRecur` (`lib/utils/recurrenceDates.ts:38`, `:40` @ ce26af4d), `MAX_RECURRENCE_OCCURRENCES` (`:52` @
  b9411a4d: 360 monthly, 40 yearly); the service writes every occurrence negative (`lib/services/expenseService.ts:522`
  @ ce26af4d) and anchors the series on the start's MONTH with `recurringDay ?? the start's day`, clamped to the month
  (`buildRecurrenceDates`, `recurrenceDates.ts:102` @ ce26af4d): the first occurrence can precede the row's date.
- **The fee's category is Impostazioni's, never the row's**: `resolveExpenseFeeCategory(categories, settings)`
  (`lib/utils/expenseFee.ts:60` @ ce26af4d) and the note `describeExpenseFeeNote({ type, destinationName, label })`
  (`:99` @ ce26af4d); with no fee category the dialog prints `EXPENSE_FEE_NEEDS_CATEGORY` and links «Impostazioni › Spese»
  (`/dashboard/settings?tab=spese`, `ExpenseDialog.tsx:899-902` @ ce26af4d). The dialog's submit drops what does not
  apply (`:2014-2037` @ ce26af4d): the member on a transfer or with Divisione off, «Fuori dal budget» on income and
  transfers, the fee on a transfer out of a property.
- **`createExpenseSettledOnDate(userId, expenseData, categoryName, subCategoryName, now, fee?)`**
  (`expenseService.ts:209` @ ce26af4d) returns `{ ids, parents, appliedEffects, appliedDebtRows }` (ids = the parents,
  then the fees); the dialog then calls `applyDebtRepayments(appliedDebtRows)` and `applyBalanceEffects(appliedEffects)`
  in that order (`ExpenseDialog.tsx:2205-2219` @ ce26af4d). A transfer with no transfer-type category gets one from
  `ensureTransferCategory(userId)` (`lib/services/expenseCategoryService.ts:76` @ ce26af4d, «Trasferimenti»).
- **Categories are written by `createCategory(userId, data)` and `updateCategory(categoryId, updates, userId?)`**
  (`expenseCategoryService.ts:117`, `:146` @ ce26af4d; the cascade on the rows runs only with `userId`); `subCategories`
  is written as a whole array, and the subcategory id is generated inline twice
  (`components/expenses/CategoryManagementDialog.tsx:636`, `lib/services/expenseImportService.ts:43` `genSubId` @
  ce26af4d). Every reader shares `queryKeys.expenses.categories(ownerId)` (`lib/query/queryKeys.ts:73` @ ce26af4d).
- **The model cannot ask with options**: PR #512's contract asks in prose. `components/ui/question-card.tsx` (in develop since 2026-11-08) gives `QuestionCard` (no button inside,
  `decline`, `otherSelect` answering `{ entity: id }`) and `parseQuestionsLenient(input: unknown)`, the only parser.
- **A changed categorisation rule would be dropped**: `dedupeMemoryItems` (`lib/server/assistant/memoryExtraction.ts:280`
  @ ce26af4d) discards a candidate that `isSimilarText` (`:241`, bigram Jaccard ≥ 0.5) finds close to an active item of
  its category; «Categorizzazione: palestra → Salute › Benessere» against «… → Salute › Palestra» scores 0.71. The
  extractor's system prompt is `EXTRACTION_SYSTEM_PROMPT` (`:318` @ ce26af4d). **Memory is the ACCOUNT's**: the hook
  sends `userId: ownerId` (`lib/hooks/useAssistantStreaming.ts:48` @ ce26af4d) and the route admits it through
  `assertCanAccessAccount` (`app/api/ai/assistant/stream/route.ts:163` @ ce26af4d), so the owner and a co-owner read and
  write one memory. The toggle is «Apprendimento automatico» in the Assistente's «Preferenze» popover
  (`components/assistant/AssistantPreferencesPopover.tsx:92` @ ce26af4d), mirrored read-only in Impostazioni › Generale
  (`components/settings/tabs/GeneraleTab.tsx:784` @ ce26af4d).
- **The bridge has two homes**: the tab's «Aggiungi» (`components/cashflow/ExpenseTrackingTab.tsx:933` @ ce26af4d,
  `max-desktop:portrait:hidden h-11`) sits in `PageVerdict.axis`, which renders under `desktop:hidden`
  (`components/ui/page-verdict.tsx:95,111` @ ce26af4d); at 1440 the add control is the header's «Nuova Spesa»
  (`app/dashboard/cashflow/page.tsx:263-275` @ ce26af4d, `hidden desktop:flex`). That page is `'use client'` (`:28` @
  ce26af4d), so it cannot read `ANTHROPIC_API_KEY`; the Assistente page is a server component that passes
  `assistantConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}` to its client body (`app/dashboard/assistant/page.tsx`).
  The flag is read inline (`components/layout/Sidebar.tsx:110` @ ce26af4d: absent means on).
- **Follow-ups**: `AssistantFollowUp { id; label; prompt }`, `MAX_FOLLOW_UPS = 3`, `buildFollowUpSuggestions(mode,
  bundle)` (`lib/utils/assistantFollowUps.ts:12`, `:20`, `:143` @ ce26af4d); the tile hands `followUp.prompt` to the
  page (`components/assistant/AssistantConversazioneTile.tsx:167` @ ce26af4d). `CURATED_FOLLOW_UPS.register` has
  PR #512's two chips, which prefill the composer (PR #512's `onFollowUpSelect` = `setDraft(prompt)` and the focus).

## 2. Goal and acceptance criteria

1. **The schema covers the four kinds** (decision 9, A16, A17, decision 66). `expenseProposalSchema` gains `kind:
   'expense' | 'income' | 'transfer' | 'debt'` with the type map (expense → `fixed`/`variable`, income → `income`,
   transfer → `transfer`, debt → `debt`), `fromAccount`, `toAccount`, `loanName?`, `payoff?`, `fee: { amount }`,
   `recurring: { frequency; count; day? }`, `newCategory?`, `newSubCategory?`, and the `superRefine` of § 4. Proof:
   `__tests__/expenseProposal.test.ts` (PR #512's, extended): the kind × type matrix (only the five pairs pass); a
   transfer without `toAccount`, a transfer with `accountId`, `fromAccount` on an expense, `loanName` on an expense,
   `payoff` without `loanName`, `recurring` on an income, `recurring` on a transfer, `recurring` with `payoff`, 361
   monthly and 41 yearly occurrences, `newCategory` with `categoryId`, `newCategory.type` ≠ `type`, `newSubCategory`
   under another category: each refused; a `debt` without `loanName`, 360 monthly, 40 yearly, a `debt` series:
   accepted. Mutation: the recurrence guard as a local list `['fixed', 'variable']` instead of `canTypeRecur` → the
   debt series is refused → red; `>=` in the cap → 360 refused → red.
2. **Transfer endpoints resolve among cash accounts AND properties** (decision 31, A16). `resolveExpenseProposal`
   maps `fromAccount`/`toAccount` to `linkedCashAssetId`/`transferCashAssetId`: first an exact id among `refs.cashAssets`
   and `refs.properties`, then the normalised name (lower-case, accents stripped, trimmed, whitespace collapsed) in
   three stages, exact → `startsWith` → `includes`; the first stage with hits decides, one hit resolves, two or more
   is the problem «ambiguo: {nomi}», none «conto sconosciuto: {testo}». Both ends on one id → «origine e destinazione
   sono lo stesso conto»; a property on both ends → «un trasferimento tocca un immobile su un lato solo»; a property
   origin with an amount over `propertyValueAvailable(property, null)` → `describePropertyTransferRefusal(name,
   available)`. The card prints «Conto A → Conto B» and, for a property, «verso l'immobile {nome}: il valore della casa
   sale di {importo}» / «dall'immobile {nome}: il valore della casa scende di {importo}». Proof:
   `__tests__/expenseProposal.test.ts`: an id resolves; «conto» against «Conto A»/«Conto B» is ambiguous; «conto a»
   wins on the exact stage over «Conto Arancio»; «conto citta» finds «Conto Città»; a property destination and its
   line; a property origin above its value refused with the dialog's sentence; two properties refused; one id twice
   refused; `e2e/assistant.register.kinds.spec.ts` (new) moves a cash balance and the property's value. Mutation: the
   `includes` stage before the exact one → «conto a» ambiguous → red; `refs.properties` left out of the search → the
   property test red.
3. **Instalments name their loan, or none** (decision 66). `loanName` resolves among `refs.loans` with the same
   id-then-name stages: one hit → `debtAssetId`; two or more → «prestito ambiguo: {nomi}» (the contract makes the model
   ask «Quale prestito?» before proposing); none → «prestito sconosciuto: {testo}». A `debt` without `loanName` is an
   unlinked instalment (no `debtAssetId`) and prints «Rata non collegata a un prestito». `payoff` → `isDebtPayoff:
   true`. A linked instalment prints `describeDebtRepaymentField({ loanName, debt: debtBalanceOf(loan), annualRatePct:
   loan.debtInterestRate, instalment: amount, split: splitInstalment(amount, debtBalanceOf(loan),
   loan.debtInterestRate, payoff === true), isPayoff: payoff === true })`. Proof: `__tests__/expenseProposal.test.ts`:
   a loan of 1000 at TAN 1.2 and an instalment of 12.34 → the line holds «11,34 €» and «1,00 €»; «mutuo» against two
   loans is ambiguous; a debt without `loanName` resolves with no `debtAssetId` and the unlinked line; a payoff of 300
   on that loan prints «Estinzione parziale»; the E2E writes 988.66 / 11.34 / 1.00. Mutation: `isPayoff` not passed
   to `splitInstalment` → the payoff line is the instalment's → red.
4. **The dialog's field rules hold on the card** (AI-06-Q12). The resolver keeps `personalMemberId` only when
   `expenseSplitEnabled` and the type is not `transfer`, `excludeFromBudget` only on `fixed`/`variable`/`debt`, the fee
   only when the transfer does not leave a property; each dropped field is a `dropped` entry «ignorato: intestatario»,
   «ignorato: fuori budget», «ignorato: commissione», printed under the row. The fee becomes `{ amount, category:
   refs.feeCategory, notes: describeExpenseFeeNote({ type, destinationName, label: note?.trim() || categoryName }) }`;
   with `refs.feeCategory` null the problem is `EXPENSE_FEE_NEEDS_CATEGORY` followed by the link «Impostazioni › Spese»
   (`/dashboard/settings?tab=spese`), as in the dialog. A transfer's category: `categoryId` when it names a
   `transfer`-type category, else the first `transfer`-type category of `refs.categories`, else «Categoria:
   Trasferimenti (nuova)» and `ensureTransferCategory(ownerId)` at «Conferma»; any other `categoryId` of a type other
   than the row's → «categoria di un altro tipo: {nome}». `properties`, `loans` and `feeCategory` come from the reads
   PR #512's `readFailed` already watches (assets, categories, settings): a failed read shows the failed-read
   `ErrorNotice` with «Conferma» disabled, never «conto sconosciuto»; an empty category list is «nessuna categoria
   configurata», never the failed read (DESIGN → The Absence-Has-Three-Names Rule). Proof:
   `__tests__/expenseProposal.test.ts` (one test per rule, the fee note on a transfer «Commissione sul trasferimento a
   Conto B», the three transfer-category cases);
   `__tests__/expenseProposalCard.test.tsx` (PR #512's, extended): the fee problem renders the link and a disabled
   «Conferma»; `readFailed` renders the notice; empty categories render the empty sentence. Mutation: the member kept on
   a transfer → red; `readFailed` read as an empty list → the notice test red.
5. **A series prints where it really starts** (decision 12, A17). `recurring` → `isRecurring: true`,
   `recurringFrequency`, `recurringCount`, `recurringDay: recurring.day ?? the day of dateIso`; the card computes
   `buildRecurrenceDates({ start: new Date(dateIso + 'T00:00:00'), frequency, count, dayOfMonth: recurring.day })` once
   and prints «{count} occorrenze {mensili|annuali}, dal {formatDate(first)} al {formatDate(last)}». Proof:
   `__tests__/expenseProposal.test.ts`: `dateIso` 2026-11-20, `day: 5`, 12 monthly → «dal 05/11/2026 al 05/10/2027»;
   `day: 31`, 3 monthly → «dal 30/11/2026 al 31/01/2027»; no `day`, 2 yearly → «2 occorrenze annuali, dal 20/11/2026
   al 20/11/2027». Mutation: the first date taken from `dateIso` → the `day: 5` test red.
6. **A new category or subcategory is proposed only when none fits, and written first** (decision 40).
   `newSubCategory: { categoryId, name }` (preferred) and `newCategory: { name, type }` (when no category of that type
   fits). The resolver reuses what exists: a `newSubCategory` whose trimmed, lower-cased name matches a subcategory of
   that category resolves to its id; a `newCategory` whose `categoryMatchKey(name, type)` (`lib/utils/expenseImport.ts:206`
   @ ce26af4d) matches a category resolves to it; neither writes. Otherwise the card prints «Nuova sottocategoria:
   {Categoria} › {nome}» or «Nuova categoria: {nome} ({EXPENSE_TYPE_LABELS[type]})» (`types/expenses.ts:15` @
   ce26af4d), and «Conferma» writes in this order: the category (§ 4 «Categories written by the card»), the categories
   key invalidated, then the row with the new ids. A category written and a row that fails: the category stays, the
   card shows PR #512's failure state, and the retry resolves the name to the existing category and writes no second one.
   Proof: `__tests__/expenseProposal.test.ts` (the two reuse rules, the two lines);
   `__tests__/expenseProposalCard.test.tsx`:
   `updateCategory` and `createCategory` run before `createExpenseSettledOnDate` (`mock.invocationCallOrder`),
   `createCategory` receives exactly `(ownerId, { name, type, subCategories: [] })`, a subcategory present in the fresh
   `getCategoryById` read but absent from the page's copy reaches `updateCategory`, a retry after a failed row calls
   `createCategory` once; `__tests__/expenseCategoryService.test.ts` (extended): `newSubCategoryId()` matches
   `/^\d+-[a-z0-9]{1,9}$/`; the kinds E2E. Mutation: the row written first → the order assertion red; the append built
   on the page's copy → the fresh-read test red.
7. **The card writes the four kinds as the dialog does, and counts what it wrote**. `ExpenseProposalCard` renders the
   lines of criteria 2–6 and writes through PR #512's path: `createExpenseSettledOnDate(ownerId, form, categoryName,
   subCategoryName, now, fee)`, then `applyDebtRepayments(appliedDebtRows)`, then `applyBalanceEffects(appliedEffects)`,
   then PR #512's invalidations. The written state stores every returned id in `writtenIds` (parents, then fees) and
   prints «{parents.length} righe registrate» for a series (PR #512's single-row text otherwise) and «+ 1 commissione» /
   «+ {n} commissioni» when fees were written. «Modifica» on a series, transfer or instalment opens the dialog
   prefilled (the fee included: `ExpenseDialogInitialValues` becomes `Partial<ExpenseFormData> & { fee?: number }`, and
   the dialog's create reset — `ExpenseDialog.tsx:1763-1774` @ c62847ab, which today spreads type, category,
   sub-category, amount, currency, date, notes, link, `linkedCashAssetId` and `excludeFromBudget` alone — is widened to
   `transferCashAssetId`, `debtAssetId`, `isDebtPayoff`, `isRecurring`, `recurringFrequency`, `recurringCount`,
   `recurringDay` and `fee`, proved field by field in `__tests__/expenseDialogInitialValues.test.tsx`),
   records `writtenIds: [saved.id]` with the saved row's `month` as PR #512 does, and prints «registrata da Modifica». Proof:
   `__tests__/expenseProposalCard.test.tsx` per kind (the
   lines, the mocked service arguments, the call order, «12 righe registrate» and «+ 12 commissioni» for a series with a
   fee, «registrata da Modifica» with `[saved.id]`); `e2e/assistant.register.kinds.spec.ts` (new) with the Admin
   assertions of § 6. Mutation: the count from `ids.length` → «24 righe» → red; `applyDebtRepayments` left out → the
   E2E loan stays at 1000 → red.
8. **The question protocol is pure and capped** (A15, T9, decisions 38 and 64). A ```assistant-question block holds ONE
   question object: `readAssistantQuestionBlocks(content)` wraps it as `[obj]` for `parseQuestionsLenient`, adds
   `entityQuestionProblems(question)`, and marks `kept = keepQuestionBlock(index)`, the index being the block's rank
   among the message's ```assistant-question blocks (`listFencedBlocks`, never a render counter). An entity question
   (`isEntityQuestion`: the id's segment before the first «:» is `account`, `center`, `member`, `loan` or `category`)
   must be `single`, carry `allowOther: true`, and hold at most 3 options unless it is `category` (2–4). The answers
   leave as ONE user message, one line per question (decision 64): «{testo} → {etichetta} [id]» for an entity,
   «{testo} → Altro: {testo libero}», «{testo} → {etichetta1}, {etichetta2}», «{testo} → preferisco non dire». Proof:
   `__tests__/questionSet.test.ts` (in develop since 2026-11-08, extended): the four line shapes, an entity picked from the Select
   («Conto E [acc-5]»), two answers joined by one line break, an unanswered entry → `null`; `isEntityQuestion` on
   `account:from`, `loan`, `budget:x`; `entityQuestionProblems` on `allowOther: false`, on `multiple`, on four account
   options, none on four category options; `keepQuestionBlock(1)` true, `(2)` false;
   `__tests__/assistantQuestionBlocks.test.ts` (new): a message with two question blocks around an
   ```expense-proposal yields indexes 0 and 1; a third is not kept; invalid JSON and a refused question carry problems;
   `isAnswerableQuestionMessage` false for an analysis message, for an older message and while another id streams.
   Mutation: `<=` in `keepQuestionBlock` → the third block kept → red; the id dropped from the entity line → red;
   `streamingMessageId` ignored → the streaming case red.
9. **The chat hosts the questions and ONE «Rispondi»** (decisions 38, 64, 65; T10). In a register message the `pre`
   interceptor renders each kept, valid question block as `QuestionCard` (`eyebrow="L'Assistente chiede"`, `decline`
   false on entity questions, `otherSelect` of every item on `account`/`center`/`member`/`loan`), and ONE «Rispondi»
   (44px) under the message's LAST valid question card, enabled when every valid card has an answer and the message is
   answerable: it is the thread's last assistant message and nothing streams. «Rispondi» records `proposalKey('question',
   index)` → `{ status: 'answered', answer, at }` for each card, then sends `formatQuestionAnswersAsMessage(entries)`
   through `useRegisterRefs().submitAnswer`. An answered card reads «Risposta: {answer}» with no rows and no button,
   after a reload too; a question in an older message never answered reads «Non risposta qui»; a block with problems,
   and any block outside register, renders as its code block. A message with a question AND a proposal renders the
   proposal cards with «Conferma» disabled and «Rispondi prima alla domanda» (`describeExpenseProposalState`'s `local`
   gains `hasQuestionBlock: boolean`). Proof:
   `__tests__/assistantQuestionBlock.test.tsx` (new, RTL): «Rispondi» absent under the first of two cards and disabled
   until both answer; the Select `getByRole('combobox', { name: 'Scegli fra tutti i conti' })` lists the cash accounts
   and the properties suffixed « (immobile)» for `account:from`; no «Preferisco non dire» row on an entity question;
   the click calls `recordProposal` twice and `submitAnswer` once with the two-line text; a persisted `answered` state
   renders the read-only line; `answerable: false` renders «Non risposta qui»; `__tests__/expenseProposal.test.ts`:
   `hasQuestionBlock: true` → `canConfirm: false` and the line; `__tests__/expenseProposalCard.test.tsx`: the mixed
   message; `e2e/assistant.register.question.spec.ts` (new) and `e2e/assistant.register.question.mobile.spec.ts`
   (new). Mutation: one «Rispondi» per card → the absence assertion red; the decline row left on entity questions → the
   no-decline assertion red.
10. **The contract says when to ask, what to propose, and the chain of caps** (decisions 65, 68, 69, 40, 71). The
    sentences of § 4 «Contract» enter `REGISTER_CONTRACT` (the `system`, byte-identical for every user) verbatim: the
    four kinds; the WHEN thresholds of decision 69; «fuori budget» never asked; «Di cosa si tratta?»; the order «ciò
    che l'utente dice in questo messaggio, poi le regole di categorizzazione in memoria, poi lo storico delle righe
    recenti»; the new-category sentence of decision 40; the question block and its entity rules; the chain of caps
    (proposals, questions, never both, never a goal); the memory-off answer. With `memoryEnabled: false`
    `buildRegisterPrompt` prints «Memoria: memoria disattivata.» in place of the memory block. Proof:
    `__tests__/assistantPromptBundle.test.ts` (the register describe PR #512 added, extended): `system` contains each
    sentence (`toContain`), the caps interpolated from `EXPENSE_PROPOSALS_MAX_PER_MESSAGE`,
    `ASSISTANT_QUESTION_MAX_PER_MESSAGE` and `MAX_RECURRENCE_OCCURRENCES`; two calls with different users, rows and
    memory give `expect(a.system).toBe(b.system)`; with memory off `userContent` contains «memoria disattivata» and
    `not.toContain('Categorizzazione:')`. Mutation: a threshold printed from the user's settings into `system` → the
    byte identity red; the order sentence deleted → red.
11. **The register block prints the learning lines** (decision 69). `buildAssistantRegisterContext` adds a «---
    PATTERN ---» block with, per category with rows in the window, a line computed over ALL the windowed rows
    (`REGISTER_RECENT_MONTHS`, before the 300 cut and the series collapse, fee rows excluded) that declares its base; a
    PRESTITI block (every `isRepayableDebt`
    asset with debt, TAN and the median instalment over the collapsed recent lines); an IMMOBILI block (every
    `isTransferableProperty` asset with its value). The centre clause prints only with `costCentersEnabled`, the member
    clause only with `expenseSplitEnabled`, the «fuori budget» clause only on spending categories. Proof:
    `__tests__/assistantRegisterContext.test.ts` (PR #512's, extended): a fixture of 301 rows of one category, the
    oldest holding the only other account, prints «301 righe in 12 mesi» and the 99,7% share; the clauses off with the
    features off; a series of 12 instalments counts once in the median «su 1 riga (serie contata una volta)»; a loan with
    no row prints «nessuna rata nelle righe recenti»; fee rows absent from the base. Mutation: the shares computed on the
    cut rows → the 301-row share red.
12. **A rule said as a habit is remembered, and a changed rule replaces the old** (A18, decisions 67, 70, 72). The
    extractor's system prompt gains the habit-only sentence of § 4 «Memory»; `dedupeMemoryItems` compares a
    «Categorizzazione:» candidate only by exact normalised text; `supersedesCategorizationRule(candidate, item)` is true
    when both are `preference` rules with the same normalised subject, the item is active and the texts differ; the
    route then pushes the old item as `archived` beside the new one, in the same transaction. `formatMemoryForPrompt` is
    unchanged: the rules print in every mode and in the emails. Proof: `__tests__/assistantMemoryExtraction.test.ts`:
    `request.system[0].text` contains the sentence; a mocked tool answer with the format survives as a `preference`;
    `supersedesCategorizationRule` true for «palestra → Salute › Palestra» vs «palestra → Sport», false for another
    subject, for an archived item and for the same text; `dedupeMemoryItems` keeps «palestra → Salute › Benessere»
    beside «palestra → Salute › Palestra» and drops an exact repeat; `__tests__/assistantRoutes.test.ts`: with an active
    rule in memory and a superseding candidate, `applyAssistantMemoryMutations` receives the new item active and the old
    id `archived` (`vi.waitFor`, the extraction runs after the stream). Mutation: `isSimilarText` applied to rules →
    the Benessere test red; the archive not pushed → the routes test red.
13. **The Cashflow bridge, in two places** (decisions 5, 16, 73). A link «Chiedi all'Assistente» (`MessageSquarePlus`,
    outline, `href="/dashboard/assistant?mode=registra"`) beside «Nuova Spesa» in the page header (`hidden
    desktop:flex`, on the Tracciamento tab) and beside «Aggiungi» in the tab's axis (`max-desktop:portrait:hidden h-11
    shrink-0`); both shown only when `isAssistantBridgeShown({ assistantConfigured, isDemo, flagValue })` is true, with
    `assistantConfigured` passed by the server page AI-06 puts in front of today's client page (§ 4 «The bridge»).
    Proof: `__tests__/navUtils.test.ts` (extended): false without the key, false in demo, false with `'false'`, true with
    the flag absent and with `'true'`; `e2e/cashflow.tracciamento.spec.ts` (1440): the header link is visible, carries
    the href and lands in Registra; `e2e/cashflow.tablet.spec.ts`: on `tablet-landscape` the axis link is 44px tall, on
    `tablet` it is absent; `e2e/cashflow.mobile.spec.ts`: absent at 390. Mutation: the axis link without
    `max-desktop:portrait:hidden` → the portrait assertion red; `assistantConfigured` dropped from the gate → the unit
    test red.
14. **Follow-ups**. `CURATED_FOLLOW_UPS.register` = «Registra una spesa di oggi», «Registra lo stipendio»,
    «Sposta soldi fra due conti»; with `opts.afterWrittenCard` the first chip is `{ id: 'register-another', label:
    "Registra un'altra", prompt: '', action: 'focus-composer' }` and the curated ones fill up to `MAX_FOLLOW_UPS` (the
    third is cut). The page derives `afterWrittenCard` from the last assistant message's `proposals` holding a `written`
    state; `focus-composer` empties and focuses the composer, sending nothing. Proof: `__tests__/assistantFollowUps.test.ts`
    (both orders, the cap); the kinds E2E: after a written card the first row is «Registra un'altra», the click
    focuses an empty composer and the faked route counts no new request. Mutation: the chip appended last → the order
    test red.
15. **Nothing of Registra (PR #512) regresses, and the first screen holds**. PR #512's suites and `e2e/assistant.register.spec.ts`,
    `e2e/assistant.register.mobile.spec.ts`, the cashflow specs, `reactCompilerCoverage` (it compiles every file under
    app, components, contexts, lib), `npm run perf:budget`, and `npm run mobile:census -- --email=census@example.com` +
    `npm run mobile:budget` on the same :3200 build: the `cashflow-tracciamento` entries at 390, 768 and 1024 green; an
    entry that moves stops the session for the owner's call (a widened entry is recorded with its `raisedBy` in
    doc/guide/prima-schermata-misure.md § Registro delle voci allargate). The same for `perf:budget`: the Assistente
    (738,1 on a ceiling of 740, raised at the retirement of 2026-11-11) and Cashflow (785,4 on 786) sit just under their ceilings, and a ceiling that must rise is
    the owner's call (`raisedBy` and a row in doc/guide/velocita.md § Registro), never the session's. Proof: the commands of § 7 A and C. Mutation:
    the axis link shown in portrait → the 768 entry moves → red.

## 3. Decisions

- **Owner**: decisions 9, 10 (as updated by decision 68), 12, 13; and of the adversarial reading 21 (RTL tests are
  `.test.tsx`), 22 (no heirs), 29 and 30 (§ 10), 31 (property transfers), 32 (§ 10), 36 (the hover accent on «Rispondi»,
  not on the bridge — decision 78), 38 (one «Rispondi» per message), 39 (the E2E key and the faked route), 40 (new categories), 64 (the
  answer lines), 65 (no question beside a proposal), 66 (loan question, unlinked instalment), 67 (rules supersede), 68
  («fuori budget» never asked, «Di cosa si tratta?»), 69 (the WHEN thresholds), 70 (rows with `ownerId`; memory as
  today, keyed by the account), 71 (memory off; the switch the answer names is «Apprendimento automatico» in the
  Assistente's «Preferenze», the one place it is changed, § 1), 72 (rules in every prompt), 73 (the bridge's gate); 58
  and 63 hold unchanged (PR #512's day thread and future-dated rows).
- **Lead's resolutions**: T9 (`parseQuestionsLenient` the only parser, `{ entity }`, `otherSelect`, `decline`), T10 =
  decision 38, X-F02 (the derived index, `proposalKey('question', i)`), AI-05-Q9 (the collapsed series feed the loan
  median), AI-06-Q11 («registrata da Modifica»), AI-06-Q12 (failed read vs empty list).
- **Adopted, reversible**: the answer is a USER MESSAGE (A15): the thread reads as a conversation, the model reads the
  answer in the history, and the only new persisted field is the cards' `answered` state.
- **Adopted, reversible**: entity questions carry ids as option values, and the `Select` behind «Altro…» lists the
  page's items (from `RegisterRefsContext`, never from the model).
- **Adopted, reversible**: the fee's category is always Impostazioni's (`refs.feeCategory`); the proposal carries the
  amount only.
- **Adopted, reversible**: a series starts in `dateIso`'s month on `recurring.day ?? dateIso's day`, clamped to the
  month; the card prints the first and last date `buildRecurrenceDates` returns.
- **Adopted, reversible**: the bridge is a LINK (navigation), not a modal: the chat needs its page (threads, memory,
  panel).
- **Adopted, reversible**: «Registra un'altra» is a follow-up chip, not a button in the card (the card is a record; the
  composer is where the next sentence goes).

## 4. Solution

### Schema extension (`lib/utils/expenseProposal.ts`, PR #512's contract extended in place)

```ts
export const expenseProposalSchema = z.object({
  kind: z.enum(['expense', 'income', 'transfer', 'debt']),
  type: z.enum(['fixed', 'variable', 'income', 'transfer', 'debt']),
  amount: …, dateIso: …,                                   // PR #512
  categoryId: z.string().min(1).optional(),                // required by the refine, except on a transfer and with newCategory
  subCategoryId: …, accountId: …, costCenterId: …, memberId: …, excludeFromBudget: …, note: …, reason: …, // PR #512
  fromAccount: z.string().min(1).max(80).optional(),       // an id, else a name
  toAccount: z.string().min(1).max(80).optional(),
  loanName: z.string().min(1).max(80).optional(),          // an id, else a name
  payoff: z.boolean().optional(),
  fee: z.object({ amount: z.number().positive().max(1_000_000) }).optional(),
  recurring: z.object({
    frequency: z.enum(['monthly', 'yearly']),
    count: z.number().int().min(2),
    day: z.number().int().min(1).max(31).optional(),
  }).optional(),
  newCategory: z.object({ name: z.string().trim().min(1).max(60), type: z.enum(['fixed', 'variable', 'income', 'debt']) }).optional(),
  newSubCategory: z.object({ categoryId: z.string().min(1), name: z.string().trim().min(1).max(60) }).optional(),
}).superRefine((p, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const kindTypes: Record<typeof p.kind, readonly string[]> = { expense: ['fixed', 'variable'], income: ['income'], transfer: ['transfer'], debt: ['debt'] };
  if (!kindTypes[p.kind].includes(p.type)) issue('kind/type disagree');
  if (p.kind === 'transfer' && (!p.fromAccount || !p.toAccount)) issue('a transfer needs fromAccount and toAccount');
  if (p.kind === 'transfer' && p.accountId) issue('a transfer names its accounts with fromAccount/toAccount');
  if (p.kind !== 'transfer' && (p.fromAccount || p.toAccount)) issue('only a transfer has fromAccount/toAccount');
  if (p.kind !== 'debt' && (p.loanName || p.payoff)) issue('only an instalment names a loan');
  if (p.payoff && !p.loanName) issue('a payoff names its loan');
  if (p.recurring && !canTypeRecur(p.type)) issue('this type does not recur');          // lib/utils/recurrenceDates.ts, THE rule
  if (p.recurring && p.payoff) issue('a payoff is one row');
  if (p.recurring && p.recurring.count > MAX_RECURRENCE_OCCURRENCES[p.recurring.frequency]) issue('too many occurrences');
  if (!p.categoryId && !p.newCategory && p.kind !== 'transfer') issue('a row needs a category');
  if (p.newCategory && (p.categoryId || p.subCategoryId || p.newSubCategory)) issue('a new category stands alone');
  if (p.newCategory && p.newCategory.type !== p.type) issue('a new category has the row type');
  if (p.newSubCategory && (p.newSubCategory.categoryId !== p.categoryId || p.subCategoryId)) issue('a new subcategory sits under the row category');
});
```

### The resolver (`resolveExpenseProposal(p, refs, now)`, PR #512's function grown)

- `refs` is PR #512's `ExpenseProposalRefs`, with the three fields AI-06 fills on the Assistente page:
  `properties = assets.filter(isTransferableProperty)`, `loans = assets.filter(isRepayableDebt)`, `feeCategory =
  resolveExpenseFeeCategory(categories, settings)`.
- Endpoints and loans: criteria 2 and 3, one private name matcher for both (id first, then the three stages on the
  normalised name: `toLowerCase()`, `normalize('NFD')` with the combining marks removed, `trim()`, runs of whitespace
  to one space).
- The form: `type`, `linkedCashAssetId`/`transferCashAssetId` for a transfer (PR #512's `accountId` path for the other
  kinds), `debtAssetId`, `isDebtPayoff`, `isRecurring`, `recurringFrequency`, `recurringCount`, `recurringDay`, the
  dialog's drops of criterion 4. `labels` gains `accounts`, `property`, `debt`, `series`, `fee`, `category` (the new
  category line or «Trasferimenti (nuova)»); `dropped` the «ignorato: …» entries; `problems` the refusals of criteria
  2–6, any of which disables «Conferma».
- The resolver also returns what «Conferma» must create first: `create: { subCategory?: { categoryId; name } ; category?:
  { name; type } ; transferCategory?: true } | null` as a field of `ResolvedExpenseProposal` (PR #512's type gains it;
  `null` when nothing is created).

### Categories written by the card (decision 40)

1. `create.subCategory`: `getCategoryById(categoryId)` (a FRESH read, `expenseCategoryService.ts:92` @ ce26af4d); a name
   already there (trimmed, lower-cased) reuses its id; otherwise `updateCategory(categoryId, { subCategories: [...fresh,
   { id: newSubCategoryId(), name }] })` with no `userId` (nothing to cascade).
2. `create.category`: `createCategory(ownerId, { name, type, subCategories: [] })`: no colour, icon or 50/30/20 role,
   as the CSV import creates them (`expenseImportService.ts:74` @ ce26af4d).
3. `create.transferCategory`: `ensureTransferCategory(ownerId)`.
4. `queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories(ownerId) })`, as `ExpenseDialog.tsx:1625`
   @ ce26af4d does (the card never imports `CategoryManagementDialog`, which would pull the dialog into the Assistente's
   chunk).
5. The row, with the ids just written.

`newSubCategoryId(): string` (`${Date.now()}-${Math.random().toString(36).slice(2, 11)}`) moves into
`lib/services/expenseCategoryService.ts`; `CategoryManagementDialog.tsx:636` and `expenseImportService.ts:43` call it
(the third copy is the card's: one rule, one place).

### `questionSet.ts` additions (the module in develop since 2026-11-08)

```ts
export const ASSISTANT_QUESTION_LANGUAGE = 'assistant-question';
export const ASSISTANT_QUESTION_MAX_PER_MESSAGE = 2;
export function isEntityQuestion(question: Question): 'account' | 'center' | 'member' | 'loan' | 'category' | null; // the id's segment before the first «:»
export function entityQuestionProblems(question: Question): string[];   // [] for a question that may render
export function keepQuestionBlock(ordinal: number): boolean;            // ordinal < ASSISTANT_QUESTION_MAX_PER_MESSAGE
export function formatQuestionAnswerAsMessage(question: Question, answer: QuestionAnswerValue, labels: Record<string, string>): string | null;
export function formatQuestionAnswersAsMessage(entries: ReadonlyArray<{ question: Question; answer: QuestionAnswerValue; labels: Record<string, string> }>): string | null;
```

- `entityQuestionProblems`: `[]` for a non-entity question; for an entity question, «domanda su un'entità: una sola
  scelta» when `kind` is `multiple`, «domanda su un'entità: "allowOther" deve essere true» when it is false, «domanda su
  un'entità: al più 3 opzioni» beyond three options on `account`/`center`/`member`/`loan`.
- `formatQuestionAnswerAsMessage`: the decline FIRST → `{text} → preferisco non dire`; `{ entity: id }` →
  `{text} → {labels[id] ?? id} [{id}]`; an option value on an entity question → `{text} → {option label} [{value}]`;
  any other answer → `{text} → {describeAnswer(question, answer, labels)}` («Altro: …», «a, b»); `describeAnswer`
  null → `null`. `formatQuestionAnswersAsMessage` joins the lines with `\n` and is `null` when any line is.

### The question blocks in the chat

- `lib/utils/assistantQuestionBlocks.ts` (new, pure): `readAssistantQuestionBlocks(content: string):
  QuestionBlockEntry[]`, `QuestionBlockEntry = { index: number; question: Question | null; problems: string[]; kept:
  boolean }`, and `isAnswerableQuestionMessage(message: Pick<AssistantMessage, 'id' | 'mode'>, lastAssistantMessageId:
  string | undefined, streamingMessageId: string | undefined): boolean` (register mode, the thread's last message with
  `role === 'assistant'`, nothing streaming). It walks `listFencedBlocks(content)` for `ASSISTANT_QUESTION_LANGUAGE`,
  takes each block's body from the list itself — `listFencedBlocks` grows `{ bodyStart; bodyEnd }` beside `offset`
  (README § 7; the scanner already knows where a block closes, and a second scan for «the next closing fence» would
  disagree with it on a longer fence or a tilde one) —, `JSON.parse`s it («JSON non valido» on a
  throw), calls `parseQuestionsLenient([obj])` (question = `questions[0] ?? null`, problems = `refused`) and appends
  `entityQuestionProblems(question)`; `kept = keepQuestionBlock(index)`.
- `components/assistant/MessageQuestionsContext.tsx` (new): `MessageQuestionsProvider({ blocks, answerable, children })`
  and `useMessageQuestions(): { blocks; hasQuestionBlock; answerable; answers: Record<number, { value:
  QuestionAnswerValue; labels: Record<string, string> }>; setAnswer(index, value, labels): void }`; `hasQuestionBlock`
  = a kept block with a question and no problems; the default value (no provider) is no blocks, not answerable.
  `AssistantStreamingResponse.tsx` mounts it per message inside PR #512's `MessageIdProvider`, with `blocks =
  mode === 'register' ? readAssistantQuestionBlocks(message.content) : []` (the PAGE's mode, the one
  `useMessageBlocks().mode` carries and the expense card is gated on — never `message.mode`) and `answerable =
  isAnswerableQuestionMessage(message,
  lastAssistantMessageId, streamingMessageId)`, `lastAssistantMessageId` being the id of the thread's last message with
  `role === 'assistant'`.
- `components/assistant/AssistantQuestionBlock.tsx` (new), rendered by the `pre` interceptor for the third language
  (`MARKDOWN_COMPONENTS` stays module-level, `AssistantStreamingResponse.tsx:108` @ c62847ab; the interceptor reads its
  index from the hast node's `position.start.offset` as the two proposal cards' does). In order: no entry in `blocks` (a message outside
  register) → the plain code block; not kept → nothing; problems → the plain code block; a persisted
  `proposals[proposalKey('question', index)]` with
  `status: 'answered'` → the read-only card (eyebrow, text, «Risposta: {answer}»); not answerable → the read-only card
  with «Non risposta qui»; otherwise `QuestionCard` with `index`/`total` among the valid kept blocks, `answer` from
  `useMessageQuestions().answers`, `decline={isEntityQuestion(question) === null}`, and `otherSelect` on
  `account`/`center`/`member`/`loan` when `!readFailed`: `{ label: 'Scegli fra tutti i conti' | 'Scegli fra tutti i
  centri di costo' | 'Scegli fra tutti gli intestatari' | 'Scegli fra tutti i prestiti', items }`, where items are the
  cash accounts (plus `refs.properties` named «{nome} (immobile)» for the ids `account:from` and `account:to`), the
  centres without `archivedAt`, the members, `refs.loans`. With `readFailed` the card gets no `otherSelect` and «Altro…»
  is the Consulente's free-text row (`QuestionCard`, 2026-11-08). A `category` question keeps the free-text «Altro…».
- **«Rispondi»** renders under the last valid kept block only, as a `Button` of 44px (`h-11`) hover-accented (`AI_CONTROL_ACCENT_CLASS` + `border border-transparent`, decisions 36 and 85; The
  AI-Accent Rule, decision 36), enabled when `formatQuestionAnswersAsMessage` of every valid kept block is non-null and
  `answerable`. Its handler (a function of its own, awaited: AGENTS.md § React Compiler and the hooks rules) records,
  for each card, `recordProposal(proposalKey('question', index), { status: 'answered', answer: describeAnswer(question,
  value, labels) })` (no `at`: the server stamps it) and awaits `patchMessageProposal({ ownerId, threadId, messageId,
  key, state })` — `false` from any card is ONE toast, `ANSWER_STATE_NOT_SAVED` (new in `dialogNarrative.ts`, beside
  `PROPOSAL_STATE_NOT_SAVED` and `GOAL_STATE_NOT_SAVED`) —, then moves the focus to the first card's read-only
  «Risposta: …» line (`tabIndex={-1}`, `focus({ preventScroll: true })`) and only then `await submitAnswer(text)`:
  the new message scrolls the conversation to its end (`conversationScrollSignal`), and a focus moved after it would
  pull the page back up.
- `ExpenseProposalCard.tsx` passes `useMessageQuestions().hasQuestionBlock` into `describeExpenseProposalState`'s
  `local`: true → `canConfirm: false` and the line «Rispondi prima alla domanda» (decision 65).
- `submitAnswer(text)` is PR #512's (`RegisterRefsContext`: the page's `streaming.submit(text)` in the register thread).

### Context (`lib/utils/assistantRegisterContext.ts`, PR #512's builder grown)

- The sections PR #512 prints stay in their order; AI-06 adds «--- PRESTITI ---» and «--- IMMOBILI ---» after «---
  CONTI ---», and «--- PATTERN ---» before «--- ULTIME RIGHE ---»; amounts as PR #512 prints them (`formatNumberIt(value,
  2) + ' €'`).
- «--- PATTERN ---», from PR #512's input (`assets`, `recentExpenses` already windowed, `settings`, `categories`), one
  line per category with rows in the window (fee rows excluded with `isFeeRow`, `lib/utils/expenseFee.ts:51` @
  ce26af4d; every occurrence of a series counted):
  `[catId] Cibo · 24 righe in 12 mesi · conto più usato Conto A 96% · in un centro: 2 righe · personali 10% · fuori
  budget 0%`. The share's base is every windowed row of the category (a row with no account counts in the base);
  «in un centro» only with `costCentersEnabled`, «personali» only with `expenseSplitEnabled`, «fuori budget» only on
  `fixed`/`variable`/`debt` categories; `transfer` categories get no line.
- `--- PRESTITI ---`: per `isRepayableDebt` asset `[id] {nome} · debito residuo {debtBalanceOf} · TAN {x}% (or «TAN non
  indicato») · rata mediana {x} su {N} righe (serie contata una volta)`, the median over the collapsed recent lines with
  that `debtAssetId` (AI-05-Q9), or «nessuna rata nelle righe recenti»; «nessun prestito» when there is none. Every
  count reads «1 riga» in the singular and «{N} righe» otherwise, in the PATTERN block too.
- `--- IMMOBILI ---`: per `isTransferableProperty` asset `[id] {nome} · valore {quantity}`; «nessun immobile» when there
  is none.

### Contract (`REGISTER_CONTRACT` in `lib/server/assistant/prompts.ts`, extended; these sentences verbatim)

```
TIPI DI RIGA: "kind" è "expense" (type "fixed" o "variable"), "income" (type "income"), "transfer" (type "transfer") o "debt" (type "debt").
Un trasferimento sposta soldi fra due conti, o fra un conto e un immobile: scrivi "fromAccount" e "toAccount" con l'[id] dei blocchi CONTI o IMMOBILI (o il nome come lo dice l'utente), mai "accountId"; un immobile sta su un lato solo. Se l'utente non nomina uno dei due lati, chiedilo.
Una rata di mutuo o di prestito ha kind "debt" e "loanName" con l'[id] o il nome del blocco PRESTITI; con due o più prestiti e un nome che non li distingue, chiedi «Quale prestito?» con una domanda "loan:"; una rata che non ripaga un prestito del blocco si propone senza "loanName"; "payoff": true solo per un'estinzione anticipata.
Le entrate e i trasferimenti non si ripetono: una serie ("recurring") è solo per spese e rate, al più ${MAX_RECURRENCE_OCCURRENCES.monthly} occorrenze mensili o ${MAX_RECURRENCE_OCCURRENCES.yearly} annuali; un'estinzione anticipata è una riga sola.
Una commissione si scrive "fee": { "amount" } sulla riga che la paga; la sua categoria è quella di Impostazioni: non sceglierla.
Proponi una categoria nuova SOLO se nessuna esistente si adatta, e preferisci una sottocategoria sotto una categoria esistente; segui il modo di categorizzare dell'utente (le righe recenti, le regole in memoria). Si scrive "newSubCategory": { "categoryId", "name" } con "categoryId" uguale a quello della riga, oppure "newCategory": { "name", "type" } senza "categoryId"; mai una categoria nuova di tipo "transfer".
L'ordine è: ciò che l'utente dice in questo messaggio, poi le regole di categorizzazione in memoria, poi lo storico delle righe recenti.
QUANDO CHIEDERE: chiedi il conto solo se l'utente non l'ha nominato E (non c'è un conto predefinito per quel tipo O il conto più usato della categoria copre meno dell'80% delle sue righe). Chiedi l'intestatario solo se la Divisione è attiva e almeno il 50% delle righe della categoria è personale. Applica «fuori budget» se l'utente lo dice o se almeno il 50% delle righe della categoria lo è: non chiederlo mai. Chiedi il centro di costo solo se i centri sono attivi e almeno una riga della categoria negli ultimi 12 mesi sta in un centro. Le percentuali sono quelle del blocco PATTERN.
Se l'importo arriva senza oggetto, chiedi «Di cosa si tratta?» con 2-4 categorie probabili e "allowOther": true. Non chiedere mai ciò che il messaggio, la memoria o le righe recenti già dicono.
DOMANDE: una domanda è un blocco ```assistant-question con UN oggetto JSON { "id", "kind": "single", "text", "options": [{ "value", "label" }], "allowOther" }, alla fine del messaggio. L'"id" di una domanda su conti, centri, intestatari, prestiti o categorie comincia con "account:", "center:", "member:", "loan:" o "category:" ("account:from" e "account:to" per i due lati di un trasferimento); i "value" sono gli [id] dei blocchi (per una categoria l'[id] della sottocategoria, o della categoria se non ne ha). Su conti, centri, intestatari e prestiti al più 3 opzioni, le più probabili secondo il blocco PATTERN, e "allowOther": true; non scrivere mai un'opzione «Altro»: la riga «Altro…» è della card.
Al più ${EXPENSE_PROPOSALS_MAX_PER_MESSAGE} blocchi ```expense-proposal o al più ${ASSISTANT_QUESTION_MAX_PER_MESSAGE} blocchi ```assistant-question per messaggio, mai i due tipi nello stesso messaggio, mai un ```goal-proposal in questa modalità: prima chiedi, poi proponi.
La risposta dell'utente arriva come un messaggio con una riga per domanda, «{domanda} → {scelta} [id]»: usa l'[id] fra parentesi quadre e riproponi la riga intera, senza chiedere di nuovo ciò che è stato risposto.
Se il blocco memoria dice «memoria disattivata» e l'utente detta una regola, rispondi: «non posso ricordarlo: la memoria è spenta ("Apprendimento automatico" nelle Preferenze dell'Assistente)».
```

PR #512's sentence on the five proposals and «Ne restano N: vuoi che continui?» stays; the chain sentence above is the
one place that states the caps together. The clause «un dubbio vero su categoria, conto o intestatario come domanda
breve» of `REGISTER_CONTRACT`'s short-answer sentence (`prompts.ts:1127` @ c62847ab, the owner's tour of 2026-11-11)
becomes the question protocol's: a real doubt is an ```assistant-question block in a message WITHOUT proposals,
never a prose question under the cards; `__tests__/assistantPromptBundle.test.ts` holds `not.toContain('come domanda
breve')`.

### Memory

- `EXTRACTION_SYSTEM_PROMPT` gains, after PR #512's sentences: «Una regola di categorizzazione si estrae solo se l'utente
  la dice come abitudine ("sempre", "di solito", "d'ora in poi"), come "preference", nel formato "Categorizzazione:
  {cosa, senza articolo} → {Categoria} › {Sottocategoria}" (la sottocategoria solo se nominata); non estrarre mai la
  scelta di una singola riga né la risposta a una domanda (un testo con "[id]").»
- `memoryExtraction.ts`: a module-level `CATEGORIZATION_RULE_PREFIX = 'Categorizzazione:'`; the subject is the text
  between the prefix and the first «→», through `normalizeText`; `dedupeMemoryItems` compares a candidate with the
  prefix only by `normalizeText(a) === normalizeText(b)`; `export function supersedesCategorizationRule(candidate:
  MemoryCandidate, item: AssistantMemoryItem): boolean` (both `preference`, both prefixed, `item.status === 'active'`,
  equal non-empty subjects, different normalised texts).
- `extractAndSaveMemory` (`stream/route.ts:83` @ ce26af4d): for each kept candidate, every active item it supersedes is
  pushed into `pendingItems` as `{ ...item, status: 'archived', updatedAt: now }`; `evaluateActiveGoals` turns them into
  `{ kind: 'item', item }` mutations and `applyAssistantMemoryMutations` writes them in its one transaction.
- `buildRegisterPrompt`: with `preferences.memoryEnabled === false` the memory slot of `userContent` is «Memoria: memoria
  disattivata.»; `formatMemoryForPrompt` is untouched (decision 72).

### Client

- `components/assistant/AssistantStreamingResponse.tsx`: the provider and the third language (above).
- `components/assistant/AssistantQuestionBlock.tsx` (new), `components/assistant/MessageQuestionsContext.tsx` (new),
  `lib/utils/assistantQuestionBlocks.ts` (new).
- `components/assistant/ExpenseProposalCard.tsx`: the lines, the counts, «Modifica» on the new kinds, the category
  writes, decision 65.
- `components/assistant/RegisterRefsContext.tsx`: `useRegisterReads` fills `properties`, `loans`, `feeCategory`.
- `components/assistant/AssistantPageClient.tsx`: `afterWrittenCard`; `onFollowUpSelect(followUp)` reads `action`
  (`focus-composer` = PR #512's `setDraft('')` and the composer's focus; `send` = `streaming.submit(prompt)`; absent =
  PR #512's behaviour for the mode).
- `components/assistant/AssistantConversazioneTile.tsx`: `onFollowUpSelect(followUp: AssistantFollowUp)` (the whole
  object, not the prompt).
- `components/expenses/ExpenseDialog.tsx`: `ExpenseDialogInitialValues = Partial<ExpenseFormData> & { fee?: number }`.

### The bridge (`lib/utils/navUtils.ts`, the page, the tab)

```ts
export function isAssistantBridgeShown({ assistantConfigured, isDemo, flagValue }: { assistantConfigured: boolean; isDemo: boolean; flagValue: string | undefined }): boolean {
  return assistantConfigured && !isDemo && flagValue !== 'false';
}
```

- **The split** (decision 73: the server/client split of the Cashflow page belongs to its first reader, the bridge): today's body of
  `app/dashboard/cashflow/page.tsx` moves unchanged into `components/cashflow/CashflowPageClient.tsx` (new, `'use
  client'`, `export function CashflowPageClient({ assistantConfigured }: { assistantConfigured: boolean })`, with the
  module-level `lazyComponent`s and constants), and `page.tsx` becomes the server component `export default function
  CashflowPage() { return <CashflowPageClient assistantConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />; }`, the
  pattern of `app/dashboard/assistant/page.tsx`. The client body sits under `ProtectedRoute`, so its
  `useSearchParams` needs no `Suspense` (doc/guide/shell.md, «A PAGE under `ProtectedRoute` needs no boundary»).
- `CashflowPageClient` computes `isAssistantBridgeShown({ assistantConfigured, isDemo, flagValue:
  process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED })` once (the inline read of `Sidebar.tsx:110`; no flag helper is
  created).
- The header: the link beside «Nuova Spesa» when `effectiveTab === 'tracking'`, `className="hidden desktop:flex"`.
- `ExpenseTrackingTab` gains `showAssistantBridge: boolean`: the link beside «Aggiungi» in the axis, with «Aggiungi»'s
  visibility `max-desktop:portrait:hidden h-11 shrink-0`. In portrait the FAB is the one add control and the «Altro»
  sheet does not carry the bridge.
- The link is `Button asChild variant="outline"` around `next/link`, «Chiedi all'Assistente», `MessageSquarePlus`
  `aria-hidden`, with no AI accent: a link that calls no model (DESIGN.md → The AI-Accent Rule's «Never accented»;
  decision 78, 2026-11-06).

### Follow-ups (`lib/utils/assistantFollowUps.ts`)

`AssistantFollowUp` gains `action?: 'send' | 'focus-composer'`: absent keeps the mode's behaviour (PR #512: a register
chip prefills the composer, the analysis chips send), `'send'` submits at once, `'focus-composer'` empties and focuses
the composer. `buildFollowUpSuggestions(mode, bundle, opts?: { afterWrittenCard?: boolean })` puts «Registra un'altra»
first when `opts.afterWrittenCard`, then the contextual and curated chips, deduped, capped at `MAX_FOLLOW_UPS`.

## 5. Constraints and traps («here it means that»)

- **The fee rule** (doc/guide/cashflow.md): the fee is a row of its own in the same batch, written by the service; the
  card never makes a second call for it, and a transfer out of a property carries none.
- **The instalment and the payoff** (doc/guide/cashflow.md): `applyDebtRepayments` before `applyBalanceEffects`, as the
  dialog; a future-dated instalment or series occurrence (decision 63) is born `balancePending` and repays on its date —
  the service decides per row, the card prints PR #512's date line.
- **A transfer can land on a PROPERTY** (doc/guide/cashflow.md § Expense Sign Convention and Type Changes): the property
  on one end only, the sale refused above the value, and the line in the dialog's words.
- **«Legata all'immobile» is not proposed from the chat**: a row written by the card carries no `propertyAssetId`; an
  instalment reaches its house through its loan (`houseOfRow`, `lib/utils/propertyLink.ts:29` @ ce26af4d: the loan
  wins), and any other row is linked from «Modifica» (the dialog's field).
- **`canTypeRecur` and `MAX_RECURRENCE_OCCURRENCES` are THE rules** (imported, never copied); the contract interpolates
  the same constants, so the `system` stays byte-identical.
- **The caps are in the text the model reads**: five proposals, two questions, never both, three entity options, the
  occurrences (AGENTS.md § Assistant · Assistente: a silent cap is a hallucination).
- **Shared account** (decision 70): the rows are written with `ownerId` (PR #512); memory stays keyed as today, by the
  account (`ownerId`, § 1): the owner and a co-owner share the categorisation rules. AI-06 does not re-key memory.
- **Memory off** (decision 71): nothing is extracted (the route's gate), the register block says «memoria disattivata»
  and the model gives the contract's answer.
- **A rule restated with another subject** («la palestra» / «palestra»): the extractor's format drops the article; two
  wordings of one subject stay as two active rules, both printed (a blind spot in the guide).
- **A category written, the row failed**: the category stays (it is the user's now), the retry reuses it.
- **A transfer with one cash account and no property**: the same-account problem; with a property it is a valid
  transfer.
- **No category of type `debt`**: the unknown-category problem, unless the proposal carries `newCategory` of type
  `debt` (the contract allows it).
- **An entity id gone since the question** (an account deleted in another tab): the resolver's «conto sconosciuto».
- **A failed PATCH on «Rispondi»**: the toast `ANSWER_STATE_NOT_SAVED` (§ 4); the message still leaves; after a reload that card is no longer in
  the last message and reads «Non risposta qui».
- **The streaming message is plain text** (`AssistantStreamingResponse.tsx:210` @ c62847ab): the question cards appear
  at `done`, never half-parsed.
- **a11y** (AGENTS.md § Accessibility): the question's text names its `ChoiceList`; the `Select` has its `aria-label`
  and `FIELD_HEIGHT_CLASS` (`components/assets/compravendita/fields.tsx:19` @ ce26af4d); «Rispondi» and the bridge are
  44px below `desktop:`; the focus after «Rispondi» goes to the first read-only answer, without scrolling and before the
  answer is sent (§ 4).
- **React Compiler** (AGENTS.md § React Compiler and the hooks rules): no conditional or logical expression inside a `try/catch` in the handlers
  (a function of its own, awaited in the try); the providers compute in render, no manual memo.
- **The Cashflow page stays prerendered**: its server page reads `ANTHROPIC_API_KEY` when Next renders it, at build,
  as the Assistente page does; a key added on Vercel shows the bridge after the next deploy (a blind spot in the
  guide, shared with the Assistente page). The split moves code, not behaviour: the cashflow specs are its proof.
- **`isAddExpenseFabShown` is the ONE rule for the FAB** (`lib/utils/navUtils.ts:19` @ b9411a4d): the bridge does not
  touch it.
- **No owner data**: E2E names «Conto A ornitorinco», «Casa ornitorinco», «Mutuo ornitorinco», «Svago ornitorinco»;
  invented amounts.
- **Cases that do not change**: demo (the Assistente page is blocked in demo, so no card or question renders there;
  the bridge's gate hides it); the period pill of the mode (PR #512); the day's thread title (decision 58); the memory
  panel (the rules show under «Preferenze» as today).

## 6. Tests per level (with the mutation that proves each)

- `__tests__/expenseProposal.test.ts` (PR #512's, extended): criteria 1–6. Mutations: as written there.
- `__tests__/questionSet.test.ts` (in develop since 2026-11-08, extended): criterion 8's pure functions.
- `__tests__/assistantQuestionBlocks.test.ts` (new): indexes, bodies, `kept`, problems. Mutation: the body cut at the
  first «```» inside a JSON string → the block with «```» in its text red.
- `__tests__/assistantQuestionBlock.test.tsx` (new, RTL `render`/`screen`/`userEvent`): criterion 9.
- `__tests__/expenseProposalCard.test.tsx` (PR #512's, extended): criteria 4, 6, 7, decision 65.
- `__tests__/assistantRegisterContext.test.ts` (PR #512's, extended): criterion 11.
- `__tests__/assistantPromptBundle.test.ts` (the register describe, extended): criterion 10; the rules of a memory item
  printed in a month prompt too (`formatMemoryForPrompt` unchanged, decision 72).
- `__tests__/assistantMemoryExtraction.test.ts` and `__tests__/assistantRoutes.test.ts` (the memoryExtraction mock gains
  `supersedesCategorizationRule` through `vi.importActual`): criterion 12.
- `__tests__/assistantFollowUps.test.ts`: criterion 14. `__tests__/navUtils.test.ts`: criterion 13.
- `__tests__/expenseCategoryService.test.ts`: `newSubCategoryId`. `__tests__/reactCompilerCoverage.test.ts`: green
  with the new files and `components/cashflow/CashflowPageClient.tsx`.
- **E2E** (stream ALWAYS faked with `page.route`, decision 39; on the helper `e2e/assistantRegister.ts` of PR #512 —
  `admin`, `plantExchange`, `installFakeStream`, `storedProposals`, `proposalBlock` —, whose fake writes the thread and
  the two messages in `assistantThreads/{id}/messages/{id}` so the PATCH finds them; the new fixtures under the ids
  `e2e-reg-kinds-` / `e2e-reg-q-`, which `removeFixture`'s `e2e-reg-` sweep must not be left to cover by accident: each
  spec removes its own in `afterAll`):
  - `e2e/assistant.register.kinds.spec.ts` (new, 1440): «Conto A/B ornitorinco», «Casa ornitorinco» (`realestate`,
    150000 at price 1), «Mutuo ornitorinco» (`loan`, `quantity: 1000`, `debtInterestRate: 1.2`), «Svago ornitorinco»
    (variable, subcategory «Cinema»), a fee category set in `assetAllocationTargets` (saved and restored as
    `e2e/cashflow.transfer-fee.spec.ts:97-154` @ ce26af4d). One test each: A → B 500 (A −500, B +500); A → Casa 2000
    (Casa +2000, the line «verso l'immobile Casa ornitorinco: il valore della casa sale di 2.000,00 €»); the instalment
    12.34 (loan `quantity` 988.66, the row's `debtPrincipalRepaid` 11.34 and `debtInterestPaid` 1.00); the 12-row series
    (12 documents, one `recurringParentId`, «12 righe registrate»); a row with a 1.50 fee (two documents, the fee's
    `feeOfTransferId`, the fee row's `categoryId` the planted fee category); `newSubCategory` (the category document
    holds «Ceramica ornitorinco», the row's `subCategoryId`
    is its id); `newCategory` (a new category document, the row's `categoryId`); the reload (every card «Registrata»);
    «Registra un'altra» (criterion 14).
  - `e2e/assistant.register.question.spec.ts` (new, 1440): six accounts; a message with `account:from` and
    `account:to` (three options each); the first answered by a row, the second by «Altro…» → the Select; «Rispondi»
    disabled until both; the next request's `prompt` is `toBe` the two lines; the cards read-only; after the reload the
    message document holds `question:0` and `question:1` `answered`; a message with a question and a proposal shows
    «Conferma» disabled and «Rispondi prima alla domanda»; the older question message shows no «Rispondi».
  - `e2e/assistant.register.question.mobile.spec.ts` (new, 390): the cards and «Rispondi» at 44px, the overflow guard
    `main.scrollWidth === main.clientWidth` plus the walk of `main *` (AGENTS.md § Tailwind Breakpoints, reference
    `e2e/fire.mobile.spec.ts`).
  - `e2e/cashflow.tracciamento.spec.ts`, `e2e/cashflow.tablet.spec.ts`, `e2e/cashflow.mobile.spec.ts` (extended):
    criterion 13.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: the eight sentences of the header each end in the right card or question, the rows
land as the dialog writes them, and the bridge appears where «Nuova Spesa» or «Aggiungi» stand.

- **A — Invarianza**: `node -v` (24), `npx tsc --noEmit`, `npm run lint`, Vitest in `Europe/Rome` and under `TZ=UTC`,
  PR #512's specs and every `e2e/cashflow.*.spec.ts` on the emulators (Java ≥ 21, app on :3100): the page split changes
  no behaviour.
- **B — Cambio di contesto**: the emulators seeded, `dev:e2e` with the key of `.env.local`: the Cashflow page shows the
  bridge and Registra opens from it; a throwaway `__tests__/zz-emulator-register-block.test.ts` (`vi.mock('server-only')`,
  `FIRESTORE_EMULATOR_HOST` set, no model call) prints `formatRegisterContextForPrompt(buildAssistantRegisterContext(await
  fetchRegisterInputs(uid, now)))` for the seed account: it holds «--- PATTERN ---», «--- PRESTITI ---» and «---
  IMMOBILI ---».
- **C — Comportamento nuovo**: the new and extended suites of § 6; the three new E2E specs and the three extended;
  `npm run perf:budget`; `npm run perf:build` + `perf:serve` (:3200), `npm run mobile:census -- --email=census@example.com`
  and `npm run mobile:budget` (criterion 15: a moved entry is the owner's call).
- **D — Sotto la UI**: Admin reads of the E2E's documents (two balances, the property's value, the loan's `quantity`
  and the row's split, twelve series documents, the fee pair, the new category and subcategory); a PATCH with the key
  `question:0`, `status: 'answered'` and an `answer` → 200; the memory document after a superseding turn (the old rule
  `archived`).
- **E — Casi negativi**: the PATCH on another user's thread → 403, an unknown message → 404, `answer` with `written` →
  400; the refused schema cases of criterion 1 render the plain code block; the bridge absent without the key
  (`ANTHROPIC_API_KEY= npm run dev:e2e`: an empty variable in the shell wins over `.env.local`) and with
  `NEXT_PUBLIC_ASSISTANT_AI_ENABLED=false`; the demo case is the unit test's (the emulators hold no demo account).
- **F — Giro guidato** (only at the owner's «pronto»): on the mirror (`npm run mirror:seed -- <email>`, `npm run
  dev:emulator` with the owner's key, the one real model call of the session), the owner types the eight sentences, judges when the Assistente asks and when it does not,
  answers two questions with one «Rispondi», states a rule and changes it, and in a new thread sees the new rule applied
  and the old one archived in the memory panel.
- **G — Ripristino**: `npm run mirror:remove`; the E2E fixtures removed by their `afterAll`;
  `__tests__/zz-emulator-register-block.test.ts`, scripts and screenshots deleted; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

Branch `feat/assistente-registra-dettagli` off `develop`, one commit after the owner's OK on the diff summary:
`feat(assistente): Registra asks the details, moves money onto accounts and houses, repays loans, repeats rows, creates
categories, remembers rules; the Cashflow bridge`, PR to `develop`. No flag of its own: the bridge follows
`NEXT_PUBLIC_ASSISTANT_AI_ENABLED`.

## 9. Documentation

- `doc/guide/assistente.md` (394 lines @ c62847ab, 406 after the retirement of 2026-11-11; over ~500 the session tells
  the owner): § Assistente — a verdict over tiles, the sentence
  «… a follow-up submits directly, except in Registra, where it prefills the composer» (`:260-261` @ c62847ab) becomes «… a follow-up acts by its `action`: absent, the mode's behaviour (it submits, in Registra it
  prefills the composer); `send` submits; `focus-composer` empties and focuses the composer («Registra un'altra», first
  after a written card)». § Files gains `lib/utils/assistantQuestionBlocks.ts` and
  `components/assistant/{AssistantQuestionBlock,MessageQuestionsContext}.tsx`; the E2E line of the header gains
  `e2e/assistant.register.{kinds,question}.spec.ts` and `e2e/assistant.register.question.mobile.spec.ts`. «##
  Registra (2026-11)» (`:299` @ c62847ab) gains: the four kinds and their fields, property transfers, the loan question and the unlinked
  instalment, series from `canTypeRecur`, the fee from Impostazioni, new categories and their write order,
  the question protocol (one block, two at most, entity ids, one «Rispondi», the answer lines), the WHEN thresholds, the
  PATTERN/PRESTITI/IMMOBILI lines. § Streaming, threads, memory gains: «a categorisation rule is compared by exact text
  and supersedes the active rule on its subject (`supersedesCategorizationRule`, the old one archived in the same
  transaction, 2026-11)». § Per-page blind spots gains: «a question is answered by a message: the thread shows it»;
  «memory is the account's: the owner and a co-owner share the categorisation rules»; «two wordings of one subject
  stay two rules»; «a row from the chat is never «Legata all'immobile»: «Modifica» sets it»; «the Cashflow bridge
  reads the key at build, as this page does».
- `doc/guide/cashflow-tracciamento.md` (250 lines, +3): the axis sentence (`:235` @ ce26af4d) «`PeriodPicker` and the
  landscape «Aggiungi» in `PageVerdict.axis`» becomes «`PeriodPicker`, the landscape «Aggiungi» and «Chiedi
  all'Assistente» in `PageVerdict.axis`»; «it is the one add affordance» (`:238`) becomes «it is the one control that
  opens the form; «Chiedi all'Assistente» beside it opens Registra»; the bridge sentence (where, the gate
  `isAssistantBridgeShown`, hidden in portrait, in demo, without the key, with the flag `'false'`) after the
  «Aggiungi» sentence of `:188-190`; § Files: «`app/dashboard/cashflow/page.tsx`» (`:15`) becomes
  «`app/dashboard/cashflow/page.tsx` (the server page) + `components/cashflow/CashflowPageClient.tsx` (its body)» and
  names `isAssistantBridgeShown`; «`app/dashboard/cashflow/page.tsx`» at `:28` and `:214` becomes
  «`components/cashflow/CashflowPageClient.tsx`».
- The other sentences that name today's page as the client body take `components/cashflow/CashflowPageClient.tsx`:
  `doc/guide/cashflow.md:25` and its heading at `:326` («The tabs load their code on demand»),
  `doc/guide/cashflow-divisione.md:67`, `doc/guide/cashflow-budget.md:165`, `doc/guide/shell.md:84` («Impostazioni and
  Cashflow read `useSearchParams` at their root» → «… Impostazioni at its root, Cashflow in `CashflowPageClient`, under
  the same `ProtectedRoute`»), and the comments of `lib/hooks/useDividendStats.ts:20` and
  `e2e/cashflow.tracciamento.spec.ts:20` (all @ ce26af4d; 0 lines added).
- `doc/guide/cashflow.md` (354 lines, +1): under the title, «the Assistente's card writes through the same services and
  the same field rules: every rule here holds there (2026-11)».
- AGENTS.md (974 lines @ c62847ab, +0): § Assistant · Assistente, the proposal-protocol bullet (`:480` @ c62847ab)
  gains the clause «; questions travel as ```assistant-question blocks, one per block, at most two, answered by ONE user
  message (2026-11)».
- CLAUDE.md (+~170 characters, well under 20 000): Key Features › **Assistente AI**, the sentence «… written by the browser on
  «Conferma», once.» becomes «… once; it asks the details with options, moves money onto accounts and houses, repays
  loans, repeats rows and proposes new categories.»; **Cashflow › Tracciamento** gains «; the bridge to Registra
  beside «Aggiungi» (2026-11)» before its guide pointer.
- DESIGN.md → The Question-Card Rule (2026-11-01) gains: «An entity question (accounts, centres, members, loans)
  shows at most three option rows and no «Preferisco non dire»; «Altro…» opens, under the list, a labelled `Select` of
  every item (`otherSelect`); in the chat the host's ONE «Rispondi» sits under the message's last card (2026-11).»
- `Draft Release Temp.md`, two entries prepended under «✨ New Features»: «**Assistente — Registra** — The Assistente now
  asks what it needs with options, records transfers (onto a house too), loan instalments and monthly or yearly series,
  proposes a new category or subcategory when none fits, and remembers how you categorise.» and «**Cashflow ›
  Tracciamento — «Chiedi all'Assistente»** — A link beside «Nuova Spesa» and «Aggiungi» opens the Assistente ready to
  record.»
- **The retirement of this spec retires `doc/ai/`** (README.md § 6): every decision cited in code, tests and guides
  becomes a dated rule; the series' history goes to README.md § Documentation (+3 lines); `doc/ai/reference/` is
  deleted with the folder (the chosen concept lives in DESIGN.md).

## 10. Declared out of scope

- Editing or deleting an existing row from the chat: never (decisions 17 and 29).
- Attachments (receipt photos) and voice input: never (decision 30).
- A per-user «always ask the account» preference: never; the asking policy is the contract's (decision 32).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Assistant · Assistente, § Cashflow — expense mechanics, § Cashflow › Tracciamento,
§ React Query and Derived State, § React Compiler and the hooks rules, § Accessibility, § Tailwind Breakpoints,
§ Commands), DESIGN.md § 5 «AI Surfaces» e The Question-Card Rule, doc/guide/assistente.md, doc/guide/cashflow.md
(§ Expense Sign Convention and Type Changes: commissione, rata, estinzione, trasferimento su un immobile; § Recurring
Series), doc/guide/cashflow-tracciamento.md, doc/guide/e2e-playwright.md, doc/guide/prima-schermata.md,
doc/ai/README.md § 3-4-7-8, doc/ai/AI-06-registra-domande-memoria-ponte.md e i diff del colloquio (PR #509) e di Registra (PR #512).
Implementa AI-06 così com'è scritta: lo schema esteso in expenseProposal.ts con il superRefine della § 4; il resolver
con i conti per id e poi per nome fra conti e immobili, i prestiti, le regole del dialog e i «ignorato: …»; le
categorie nuove scritte prima della riga; il protocollo ```assistant-question su questionSet.ts (parseQuestionsLenient
con [obj], nessun altro parser), assistantQuestionBlocks.ts, MessageQuestionsContext e AssistantQuestionBlock con un
solo «Rispondi» per messaggio; le frasi del contratto della § 4 alla lettera; le righe PATTERN, PRESTITI e IMMOBILI;
la frase dell'estrattore e supersedesCategorizationRule; la pagina Cashflow divisa in pagina server e
CashflowPageClient; il ponte in due punti con isAssistantBridgeShown; i follow-up.
Test: le suite della § 6 in entrambe le zone (i test dei componenti in .test.tsx con React Testing Library), le spec
Playwright della § 6 con lo stream SEMPRE finto e le asserzioni Admin sui dati, perf:budget, mobile:census e
mobile:budget. Fermati e chiedimi se un contratto del colloquio (PR #509) o di Registra (PR #512) non è quello della README § 7, se una
voce di mobile:budget si sposta o se un tetto di perf:budget deve salire. Collaudo: § 7, la fase F sul mirror al mio «pronto». Un branch, un commit, solo dopo
il mio OK sul riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **high** (the contracts exist; the work is extension, the category writes and tests).
Estimated size: one long session, ~6 h; ~220 lines of schema and resolver, ~120 of `questionSet` and the question
blocks, ~140 of contract text, ~260 of client, ~550 of tests, three new E2E specs and three extended.
