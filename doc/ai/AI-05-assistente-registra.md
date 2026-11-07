# AI-05 — Assistente › Registra: the mode, the context, the proposal, the confirmation

> Series `doc/ai/` (README.md § 5): **depends on AI-02** (retired on 2026-11-07, in develop since 2026-11-07, PR #505: the
> CASHFLOW 12 MESI block and `buildCashAccountLines`) **and AI-03** (the AI accent in CSS and `Tile generated`,
> DESIGN.md § 5 «AI Surfaces», the RTL harness of decision 21); **AI-06 depends on it**. Written on 2026-11-01 from `develop` @
> b9411a4d. Executes decisions 5, 9 (the first two row kinds: expenses and income — transfers and instalments are
> AI-06), 11, 16, 17, 18, 26, 28, 58–63, 82 and the adopted choices A9–A14. The user's sentence that must work at the end
> of this spec: «Ciao, ho fatto spesa per 103 euro, per favore segnalo» → a card «Spesa · 103,00 € · Cibo › Spesa ·
> oggi · Conto principale» → «Conferma» → the row in Cashflow › Tracciamento. § 4 Client is written for the Assistente's
> concept B «La scena» (decision 74, 2026-11-06), a conversation column with cards; criterion 20, its § 4 step and
> its test added on 2026-11-06 at AI-01's retirement (decision 78, the page's motion), to be reread there. Read
> adversarially on 2026-11-01: 43 findings applied, the decisions 21–73 in
> README.md § 3 (this spec: decisions 21, 22, 26, 28, 29, 30, 33, 34, 35, 36, 37, 39, 58, 59, 60, 61, 62, 63).

## 1. The problem today (evidence on the code)

- **Five modes, all analytical**: `AssistantMode = 'month_analysis' | 'year_analysis' | 'ytd_analysis' | 'history_analysis' | 'chat'`
  (`types/assistant.ts:9` @ b9411a4d). The WARNING comment above it (`:1-8` @ ce26af4d) lists seven places, two of
  them stale (`AssistantComposer.tsx` has no mode selector — the tabs are `PERIOD_TABS` in
  `AssistantPeriodSelector.tsx:27-33` @ ce26af4d; `prompts.ts` has no `getPeriodLabel`), and misses
  `buildStreamRequestBody` (`lib/hooks/useAssistantStreaming.ts:36-65` @ ce26af4d), `assistantPeriodOptions.ts`, the
  thread list's badge and the context route. The only `Record<AssistantMode, …>` is `CURATED_FOLLOW_UPS`
  (`lib/utils/assistantFollowUps.ts:24` @ b9411a4d); the other sites branch with `if` and fall through to «chat»:
  `anthropicStream.ts` `buildPrompt` (`:56-94` @ ce26af4d, private), `store.ts` `getDefaultThreadTitle` (`:37-43`
  @ b9411a4d, private), `assistantPeriodOptions.ts` (`getActivePeriodLabel` `:69`, `findThreadForPeriod` `:87`,
  `buildComposerPlaceholder` `:136`, `buildEmptyStateQuestion` `:158` @ ce26af4d), `AssistantThreadList.tsx`
  `getModeBadgeLabel` (`:21` @ ce26af4d, private), `webSearchPolicy.ts` (`:76-97` @ ce26af4d: a non-structured mode
  falls to keyword detection), `useAssistantPeriodContext.ts:192-225` (any other mode gets the disabled month query)
  and `app/api/ai/assistant/context/route.ts:44-99` (its `else` builds a month context) @ b9411a4d.
- **The stream route casts its body** (`app/api/ai/assistant/stream/route.ts:162` @ b9411a4d), then
  `assertCanAccessAccount` (`:163`), the rate limit 30/h (`:165`), and a prompt check that only refuses an empty one
  (`:180-185` @ ce26af4d): no length cap, and the composer has no `maxLength` (`AssistantComposer.tsx:56-80` @
  ce26af4d). A mode with no branch (`:215-245` @ ce26af4d) gets no bundle and `buildChatPrompt` prints «Non è stato
  selezionato un periodo…».
- **A thread's title is the prompt's first 60 characters**: the route creates the thread with
  `buildThreadTitleFromPrompt(body.prompt, body.mode)` (`:264-272` @ ce26af4d; `store.ts:45-52` falls back to
  `getDefaultThreadTitle` only for an empty prompt) and rewrites the title from the prompt while
  `lastMessagePreview` is empty (`:349-357` @ ce26af4d). The preview is `assistantText || userMessage.content`, so a
  fenced JSON block would be the thread list's preview.
- **The model writes nothing and knows no ids**: the categories block prints name and type, no id (`prompts.ts:647-654` @
  b9411a4d); the goal-proposal protocol lives INSIDE `ASSISTANT_SYSTEM_CORE` (`:740-747` @ b9411a4d), which the
  periodic emails share (`buildEmailAiPrompt`, `lib/server/monthlyEmailService.ts:696` @ ce26af4d). No account with
  its id, no cost centre, no member, no recent row and no month total reaches the prompt in any mode.
- **The one write protocol is the goal card**: a ```goal-proposal block → the module-level `pre` interceptor of
  `AssistantStreamingResponse.tsx:55-81` @ ce26af4d → `GoalProposalCard` (state in the component only,
  `useState<SubmitState>` `:119`; buttons `h-9` = 36px `:273,:290` @ b9411a4d; root `not-prose my-3 rounded-xl
  bg-muted/40 p-4` `:179` @ b9411a4d) → `POST`/`PATCH /api/goals`. After a reload the card is idle again (the
  double-confirm blind spot of `doc/guide/assistente.md`, since 2026-09-19): the message document has no field for a
  card's outcome (`store.ts:285-316` @ b9411a4d), the hook ignores `done.messageId`
  (`useAssistantStreaming.ts:320-331` @ b9411a4d), and the rendered list is the stream buffer whenever it is
  non-empty (`:183-191` @ ce26af4d) — a thread refetch never replaces it until an explicit `resetStream()` on a
  thread switch. A message stopped or failed before `done` keeps its `local-assistant-…` id (`:234` @ ce26af4d).
- **The write contract exists and is the browser's** (decision 17): `createExpenseSettledOnDate(userId, ExpenseFormData, categoryName, subCategoryName, now, fee?)`
  → `{ ids, parents, appliedEffects, appliedDebtRows }` (`lib/services/expenseService.ts:209` @ b9411a4d; a row
  dated after today is written `balancePending`), then `applyDebtRepayments(appliedDebtRows)`
  (`debtRepaymentService.ts:50` @ b9411a4d) and `applyBalanceEffects(appliedEffects)`
  (`cashBalanceReconciliation.ts:74` @ b9411a4d). The service signs the amount from `type` and invalidates the
  Panoramica's materialized summary on every create (`invalidateDashboardOverviewSummary`, `expenseService.ts:469` @
  ce26af4d). The dialog's save (`ExpenseDialog.tsx:2041-2252` @ ce26af4d) invalidates `assets.all` and
  `dashboard.overview` only when a balance moved (`:2216-2220`), `costCenters.all` always (`:2250`), never
  `expenses.all` (its host does: `app/dashboard/cashflow/page.tsx:191-197` @ ce26af4d); its create toast is «Spesa
  creata con successo» for an income too (`:2241` @ ce26af4d). Neither the dialog nor the goal card uses
  `useMutation`.
- **The dialog cannot be prefilled**: `ExpenseDialogProps` = `{ open, onClose, expense?, onSuccess?, returnFocusTo? }`
  (`:400-411` @ ce26af4d). Four behaviours defeat a naive prefill: the opening subject is `{ open, expense }`
  (`:1638-1652` @ ce26af4d: step, cost centre, property and member settled during render); the new-row branch of the
  reset enumerates blank fields (`:1697-1745`); an effect clears `subCategoryId` whenever the category changes on a
  new row (`:1659-1663`); two effects put the type's default account on every new row (`:1750-1755`, `:1778-1785`).
  The date field builds `new Date(dateString + 'T00:00:00')` (`:655-661`), the browser's local midnight. The dialog is
  imported statically by its two hosts (`ExpenseTrackingTab.tsx:72`, `CostCenterDetail.tsx:110` @ ce26af4d).
- **Cashflow has no month in its URL**: it reads `tab` and `owner` (`app/dashboard/cashflow/page.tsx:106-109` @
  ce26af4d) and starts Tracciamento on the current month (`:119`).
- **The page's verdict needs a bundle**: outside a free question the verdict is `buildAssistantPeriodVerdict` on the
  context bundle, else the skeleton (`AssistantPageClient.tsx:296-302`, `:533-539` @ ce26af4d) — a mode with no
  bundle renders the skeleton forever. Follow-ups submit at once (`:579`); the starter rows are the analysis chips
  (`:327-335`); the header's «Nuova conversazione» is disabled while streaming (`AssistantHeader.tsx:115` @
  ce26af4d); its icon actions are 36px (`:76,:94`) and 32px (the preferences trigger,
  `AssistantPreferencesPopover.tsx:44` @ ce26af4d), the primary 36px below `desktop:` (`AssistantHeader.tsx:116`).
- **Demo**: the page renders `AssistantLockedState` in demo (`AssistantPageClient.tsx:521-525` @ ce26af4d): no
  conversation and no card is ever mounted there.
- **The base seed has none of this spec's fixtures**: «Conto Corrente» (`seed-cash`), «Alimentari», «Casa»,
  «Stipendio › Salario», no default account (`scripts/seedEmulator.ts:160-240` @ ce26af4d).

## 2. Goal and acceptance criteria

A «Registra» mode in which the assistant knows the categories, the accounts, the centres and the members BY ID and the
month so far, proposes up to five rows as cards, and the browser writes each on «Conferma» through today's services —
once, even after a reload.

1. **`AssistantMode` gains `'register'`, handled explicitly at every site**, and the WARNING comment of
   `types/assistant.ts` is rewritten to the true list (§ 4 Types). In `register`: `getActivePeriodLabel` → «Registra ·
   senza periodo», `buildComposerPlaceholder` → «Scrivi cosa hai speso o incassato…», `buildEmptyStateQuestion` →
   «Cosa vuoi registrare?», `findThreadForPeriod` → `undefined`, `getModeBadgeLabel` (moved, exported, to
   `lib/utils/assistantPeriodOptions.ts`) → «Registra», `getDefaultThreadTitle` (exported from `store.ts`) →
   «Registrazioni», `resolveAssistantWebSearchPolicy` → `false` whatever the prompt says, `CURATED_FOLLOW_UPS.register`
   → «Registra una spesa di oggi», «Registra lo stipendio», the context route → 400 «La modalità Registra non ha un
   contesto di periodo», `anthropicStream` → `buildRegisterPrompt` with `ASSISTANT_REGISTER_MAX_TOKENS` and no tools.
   Proof: `assistantPeriodOptions.test.ts`, `assistantThreadRoutes.test.ts` (`getDefaultThreadTitle`),
   `assistantPromptRouting.test.ts` («benzina 60 euro, cerca sul web il prezzo del petrolio»: `true` in `chat`,
   `false` in `register`), `assistantFollowUps.test.ts`, `assistantRoutes.test.ts` (the context route),
   `anthropicStream.test.ts` (the SDK spy receives `max_tokens: 16000`, no `tools`, and
   `system === buildRegisterPrompt(…).system`); `npx tsc --noEmit` on the `Record`. Mutation: delete the `register` branch of `buildEmptyStateQuestion` → it returns «Cosa vuoi sapere
   sullo storico del portafoglio?» and the test fails.
2. **The stream route validates its body with zod** (`assistantStreamRequestSchema` in `lib/server/validation.ts`)
   before `assertCanAccessAccount`: every field of `AssistantStreamRequest` is declared — `userId` (min 1), `mode`
   (the six values), `prompt` (trimmed, 1–`ASSISTANT_PROMPT_MAX_LENGTH` = 4000, every mode — decision 60), `threadId?`
   (`assistantThreadCursorSchema`), `month?` (`{ year: int, month: int 1–12 }`), `year?` (int), `chatContext?` (the
   five values), `preferences?` (the four fields, partial). For `register` the route builds the register context and
   no bundle. Proof: `assistantRoutes.test.ts`: a body with `mode: 'weekly'` → 400; a 4001-character prompt in
   `month_analysis` → 400; a valid `year_analysis` body reaches `buildAssistantYearContext` with its `year` (the
   schema keeps every field); `register` → `fetchRegisterInputs` called once, `buildAssistantMonthContext` never;
   `serverValidation.test.ts` for the schema's bounds. Mutation: declare only `mode` and `prompt` → the `year` test
   fails (zod strips the undeclared keys).
3. **The composer caps the message at 4000 characters with a counter from 3800** (decision 60):
   `maxLength={ASSISTANT_PROMPT_MAX_LENGTH}` on the textarea and, from 3800 characters, the line «3.812 / 4.000
   caratteri» under it (`describePromptLength(length)` in `assistantPeriodOptions.ts`, `null` below 3800), tied to the
   textarea by `aria-describedby`, no live region. Proof: `assistantPeriodOptions.test.ts` (3799 → `null`, 3800 →
   «3.800 / 4.000 caratteri»); `__tests__/assistantComposer.test.tsx` (new, RTL): the textarea has `maxlength="4000"`
   and the counter appears after typing 3800 characters. Mutation: start the counter at 3900 → the 3800 case fails.
4. **`buildAssistantRegisterContext` is pure and `formatRegisterContextForPrompt` prints the register block**
   (`lib/utils/assistantRegisterContext.ts`): «Oggi: domenica 1 novembre 2026 (2026-11-01)» (the Italian weekday, the
   date, the ISO form); every category by type with `[id]`, its type label (`EXPENSE_TYPE_LABELS`) and its
   subcategories with `[id]`, a debt or transfer category marked «non proponibile in questa modalità», «Nessuna
   categoria configurata» when there is none; the cash accounts the dialog lists (`isCashAccount`) through
   `buildCashAccountLines(assets, settings, assetValueOf)` as `[id] name · balance · addebito predefinito / accredito
   predefinito`, every account printed (a zero balance as 0,00 €), «Nessun conto configurato: una riga proposta non
   muove alcun saldo» when there is none; the cost centres WITHOUT `archivedAt` as `[id] name` when
   `costCentersEnabled` (else «Centri di costo: non attivi»); the members `[id] name` when `expenseSplitEnabled` (else
   «Intestatari: non attivi»); the recent rows of the window — from the Italian first day of the month eleven months
   back through the end of the Italian today, future rows excluded — newest first, ONE line per `recurringParentId`
   («serie ×N, mensile»), cut at `REGISTER_RECENT_ROWS_CAP = 300` lines with «(le N righe più vecchie sono omesse;
   sotto le 300 più recenti)» and the count read. Proof: `__tests__/assistantRegisterContext.test.ts` (new) with
   invented data, run in `Europe/Rome`, the machine's zone and `TZ=UTC`: a row at Italian midnight of the window's
   first day is in, the previous day's is out; a twelve-occurrence series is one line «serie ×12, mensile»; 310
   lines → 300 printed and the cut sentence with 10; an archived centre absent; an account at 0 printed. Mutation:
   sort ascending → the cut drops the newest rows and the test fails.
5. **The «--- IL MESE ---» block** (decision 28) closes the register block: «Entrate X € · Spese Y € (di cui Z € in
   calendario dopo oggi) · Saldo W €» from `getDashboardOverview(userId, { now })`
   (`lib/services/dashboardOverviewService.ts:714` @ ce26af4d — the read `GET /api/dashboard/overview` serves the
   Panoramica: `expenseStats.currentMonth.{income, expenses, expensesScheduled, net}`); «Spese finora per tipo: Spese
   Necessarie … · Spese Non Necessarie … · Debiti …» from the register's own rows of the Italian month up to today;
   the Budget state from `budgets/{uid}` measured with the Budget tab's pure layer (`getPeriodActual`,
   `getMonthlyTotalExpenses`, `budgetItemLabel` in `lib/utils/budgetUtils.ts`): one line per expense budget with a
   ceiling, `speso / tetto (rapporto%) · mensile` or `· annuale, da inizio anno`, highest ratio first, cut at
   `REGISTER_MONTH_BUDGET_ROWS_CAP = 20` with «(e altri N budget non elencati)», then «Tetto complessivo» when set.
   Neither read can fail the stream: a rejected overview read and a null `expenseStats` both print «Riepilogo del mese
   non disponibile: lettura non riuscita.», a rejected budget read «Budget: lettura non riuscita.», no budget «Budget:
   nessuno configurato.» — never zeros. Proof: `assistantRegisterContext.test.ts` (the lines, the 20 cap, the three
   absence sentences, a budget at 540/600 printed «90%»); `assistantMonthContextService.test.ts` (`fetchRegisterInputs`
   with the overview read rejected still resolves, `month.stats === null`). Mutation: print 0 € when `stats` is null →
   the «non disponibile» assertion fails.
6. **The proposal protocol** (`lib/utils/expenseProposal.ts`, § 4): `expenseProposalSchema` (`dateIso` a real
   calendar date: «2026-02-31» refused), `parseExpenseProposal`, `listFencedBlocks`, `proposalKey`, at most
   `EXPENSE_PROPOSALS_MAX_PER_MESSAGE = 5` cards per message (decision 61: a sixth block renders as code). The
   `REGISTER_CONTRACT` sits in `buildRegisterPrompt`'s `system` only; `ASSISTANT_SYSTEM_CORE`, every other builder's
   `system` and the email prompt are unchanged. Proof: `__tests__/expenseProposal.test.ts` (new): bounds, the
   kind/type refine, the calendar date, `listFencedBlocks` on a message with five ```expense-proposal blocks and one
   ```goal-proposal returns the indexes 0–4 and 0 (through `proposalKey`: `expense:0`…`expense:4`, `goal:0`); `assistantPromptBundle.test.ts`:
   `buildRegisterPrompt(…).system === ASSISTANT_SYSTEM_CORE + '\n\n' + REGISTER_CONTRACT`, the same `system` for two
   users with different register blocks (`expect(a.system).toBe(b.system)`), `ASSISTANT_SYSTEM_CORE` and
   `buildChatPrompt(…).system` and `buildEmailAiPrompt(…).system` `not.toContain('expense-proposal')`;
   `__tests__/assistantStreamingResponse.test.tsx` (new, RTL): six blocks → five cards and one `<pre>`; a fence
   indented by two spaces keeps its key; a block inside a `>` quote renders as code and leaves the next block's key
   unchanged; in `chat` an expense block is code. Mutation: move the contract into `ASSISTANT_SYSTEM_CORE` → the
   `not.toContain` assertions fail.
7. **A proposal is resolved against what the page holds** (`resolveExpenseProposal(p, refs)`): the problems that
   disable «Conferma» — unknown category, a category whose `type` differs from the proposal's, unknown subcategory
   of that category, an account outside the cash accounts, an unknown member (Divisione on), an archived or unknown
   centre (centres on); the fields dropped and listed «ignorato: …» — a centre with centres off, a member with
   Divisione off, `excludeFromBudget` on an income; `linkedCashAssetId = accountId ?? the default of the kind`,
   «nessun conto: il saldo non si muove» when there is none; `amount` through `roundToCents`; `date` =
   `new Date(dateIso + 'T00:00:00')` for every proposal, today included (the dialog's date field); a date after the
   Italian today labelled «si applica al saldo il DD/MM/YYYY» (decision 63). `form` carries only the ids that
   resolve. Proof: `expenseProposal.test.ts`: each problem and each drop on invented refs; `getItalyDateIso(form.date)
   === dateIso` under `TZ=Europe/Rome` and `TZ=UTC` (the suite runs in both); income without `accountId` takes the
   credit default; an unknown category leaves `form.categoryId` undefined. Mutation: default an income to the debit
   account → the credit-default test fails.
8. **`ExpenseProposalCard` renders the row as the feed prints it, under The AI-Accent Rule**: a `not-prose rounded-xl`
   block with the 1px `--ai-accent` border at rest, the glow only on hover and focus-visible (decision 36), the eyebrow
   «L'Assistente propone» accented, `data-generated`; the row «Spesa · 103,00 € · Cibo › Spesa · oggi · Conto
   principale» (kind, amount with the feed's euro formatter, category › sub, «oggi»/«ieri»/`DD/MM/YYYY`, account),
   a second line with centre, member and the «fuori budget» chip (`EXPENSE_BUDGET_EXCLUSION_CHIP`), the `reason` at
   13px muted, the problems and drops; three buttons «Conferma» (primary), «Modifica» (outline), «Ignora» (ghost),
   `h-11 desktop:h-9`, in a `flex flex-wrap gap-2` row (they wrap at 390). Proof:
   `__tests__/expenseProposalCard.test.tsx` (new, RTL, the refs and message contexts provided by test wrappers):
   the row text, the three buttons with `h-11`, the problem state with «Conferma» disabled, the drop line;
   `e2e/assistant.register.mobile.spec.ts` (new) runs the repo's overflow guard on the card (`main.scrollWidth ===
   main.clientWidth` plus the walk of `main *`, as `e2e/fire.mobile.spec.ts:108-124` @ ce26af4d). Mutation: drop
   `flex-wrap` → the 390 overflow guard fails.
9. **«Conferma» writes through the services, once**: `writeExpenseProposal(ownerId, resolved, now)` (module-level in
   the card) → `createExpenseSettledOnDate` → `applyDebtRepayments` → `applyBalanceEffects`; then the card records
   the outcome (criterion 10), toasts `ROW_CREATED_TOAST[kind]` («Spesa creata con successo» / «Entrata creata con
   successo», `lib/utils/dialogNarrative.ts`), invalidates `expenses.all`, `assets.all`, `dashboard.overview`,
   `costCenters.all` (A10) and shows «Registrata · apri in Cashflow» linking `/dashboard/cashflow?tab=tracking&month=YYYY-MM`
   (the row's month, decision 59). A `saving` state disables «Conferma» from the first click. A future date writes a
   `balancePending` row and moves no balance (decision 63). Proof: `e2e/assistant.register.spec.ts` (new) on the
   emulators with the stream faked: «Conferma» → the Admin read of `expenses` finds ONE row (amount −103, the spec's
   category and subcategory, `linkedCashAssetId` the spec's account, no `balancePending`, `getItalyDateIso(date)` =
   today) and the account's `quantity` lowered by 103 (`quantityOf`, as `e2e/assets.compravendita.spec.ts:157`); a
   proposal dated tomorrow → the row has `balancePending: true` and the quantity is unchanged; a double click writes
   one row. Mutation: drop the `saving` guard → the double click writes two rows and the count fails.
10. **One confirmation, persisted, for both cards** (decision 18, A11): `AssistantMessage.proposals?: Record<string, AssistantProposalState>`,
    keyed `proposalKey(kind, index)` with the index derived from the markdown (X-F02); written by `PATCH
    /api/ai/assistant/threads/[threadId]/messages/[messageId]` → `setAssistantMessageProposal` (404 for an unknown
    message, 403 for another user's thread, `update()` on `new FieldPath('proposals', key)` so nothing is created, `at`
    stamped by the server); returned by the GET through `mapMessage` and hydrated by `useAssistantThreads`
    (`proposals[key].at` through `toDate`). The streaming message adopts `done.messageId`; the card's outcome is
    recorded in the stream buffer AND in the `assistant.thread(threadId)` cache before the PATCH (`recordProposal`), so
    the session never shows the buttons again; a message whose id starts with `local-` (stopped or failed before
    `done`) shows «Risposta interrotta: chiedi di riproporla» and no buttons. The goal card reads and writes the same
    state and keeps its labels («Obiettivo creato» / «Obiettivo aggiornato» / «Proposta ignorata»). Proof:
    `__tests__/assistantMessageRoute.test.ts` (new): 200 with the stored state, 400 for the key `expense:x` and for
    `answer` without `answered`, 403, 404; `assistantThreadsStore.test.ts`: `update` called with the field path, never
    `set`; `mapMessage` returns `proposals`; `__tests__/assistantStreamBuffer.test.ts` (new): `adoptStreamMessageId`
    and `applyProposalToMessages`; `__tests__/useAssistantStreaming.test.tsx` (new, `renderHook`): after a faked SSE
    body ending in `done { messageId: 'msg-1' }` the assistant message's id is `msg-1`; `recordProposal` changes the
    buffer and the cached detail; `__tests__/goalProposalCard.test.tsx` (new, RTL): a persisted `written` renders
    «Obiettivo creato» without buttons; the E2E with the owner's sentence «Ciao, ho speso 100 euro alla Coop per la
    spesa e 20 euro in farmacia» (decision 61): two cards, the first confirmed and the second ignored, the message
    document holds `proposals['expense:0'].status === 'written'` with the row's id and `proposals['expense:1'].status
    === 'ignored'`, and after a reload on `?mode=registra` the two cards read «Registrata» and «Ignorata» with no
    «Conferma». Mutation: skip `adoptStreamMessageId` → the PATCH targets `local-assistant-…`, the route answers 404 and
    after the reload both cards are idle again.
11. **The way in and out of Registra** (decisions 16, 58): `AssistantHeader` gains the icon action «Registra»
    (`PencilLine`, aria-label «Registra una spesa o un'entrata», disabled when `isDemo || isStreaming`, hover-accented
    per decision 36); it calls `enterRegister()`: the day's register thread (`findRegisterThread(threads, todayIso)`:
    `mode === 'register'` and `getItalyDateIso(createdAt) === todayIso`) or none (the next message creates it), then
    `setMode('register')` and the focus on the composer. In `register` the period pill is not rendered; in its place
    a one-line `TILE_SUB_EYEBROW_CLASS` strip «Registra · l'Assistente conosce categorie, conti e le ultime righe»
    with the link-button «Torna all'analisi» (disabled while streaming), which calls `handleNewThread()` then
    `handleModeChange('month_analysis')` and removes `?mode=registra` from the URL (`router.replace`).
    `?mode=registra` on `/dashboard/assistant` does what the action does, once the thread list has resolved. A
    register thread is only ever sent `mode: 'register'` and an analysis thread never is. Proof: `assistantPeriodOptions.test.ts` (`findRegisterThread`: a register thread created at 23:30 Italian
    time yesterday is not today's, in both zones); the E2E: the action shows the strip and no `tablist` «Periodo di
    analisi»; a visit to `?mode=registra` with a planted thread of today opens it; «Torna all'analisi» shows the pill
    and an empty conversation. Mutation: «Torna all'analisi» calling `handleModeChange` alone → the E2E sees the
    register thread still open and fails.
12. **The register thread is «Registrazioni · 1 nov 2026», one per Italian day** (decision 58):
    `buildThreadTitleFromPrompt(prompt, mode, now = new Date())` returns `Registrazioni · ${giorno mese-breve anno}`
    (the Italian date of `now`) for `register` whatever the prompt; the route never retitles a register thread; the
    thread's `lastMessagePreview` is `stripFencedBlocks(assistantText) || userMessage.content` in every mode. Proof:
    `assistantThreadRoutes.test.ts` (`buildThreadTitleFromPrompt`): «ho speso 5 euro» in `register` at
    `2026-11-01T22:30:00Z` (23:30 Italian) → «Registrazioni · 1 nov 2026» and at `2026-11-01T23:30:00Z` (00:30
    Italian) → «Registrazioni · 2 nov 2026», in both zones; `assistantRoutes.test.ts`: a register stream on an
    existing thread leaves its title, and an answer that is only a block stores the user's message as preview.
    Mutation: build the title from `now` in the process zone → the `TZ=UTC` run at `2026-11-01T23:30:00Z` prints
    «1 nov» instead of «2 nov» and fails.
13. **The verdict and the panel in Registra** (decision 62): the verdict is `buildRegisterVerdict(summary)` —
    `null` → «Registra una spesa o un'entrata.» + «Scrivila come la diresti: te la propongo come riga e la scrivi tu
    con Conferma.»; a summary without `recent` → «Conosco 12 categorie e 3 conti: scrivi la spesa o l'entrata come
    la diresti.»; with `recent` → «Conosco 12 categorie, 3 conti e le ultime 300 righe: scrivi la spesa o l'entrata
    come la diresti.» — never the skeleton. The companion column shows
    `RegistraContestoTile` («Cosa conosce l'Assistente»: the cash accounts with balance and their default roles, the
    categories' count, the centres and Divisione on or off, «ultime N righe lette» once known) from the summary
    computed in the browser out of the hooks already loaded (`summarizeRegisterContext` on a context with
    `recentExpenses: null`), replaced by the summary of the `register` SSE event when one arrives; a failed read of
    the assets or the categories shows the failed-read `ErrorNotice`, an empty list «nessuna categoria configurata»
    (DESIGN → The Absence-Has-Three-Names Rule). Proof: `assistantNarrative.test.ts` (the three verdicts, «1
    categoria», «nessun conto»); the E2E sees «Conto principale» in the tile before any message and «ultime 4 righe
    lette» after the faked stream's `register` event. Mutation: render the verdict from `contextBundle` in register →
    the skeleton stays and the E2E's verdict assertion fails.
14. **`ExpenseDialog` accepts `initialValues?: ExpenseDialogInitialValues`** (`= Partial<ExpenseFormData>`), part of
    the opening subject: `openSubject` becomes `{ open, expense, initialValues }`; the render-time settle opens step 2
    when `initialValues.categoryId` is set and takes the cost centre, the property and the member from it; the reset's
    new-row branch spreads `initialValues` over the enumerated blank fields (`initialValues` in its deps); the
    subcategory-clear effect skips while the category equals `initialValues.categoryId`; both default-account effects
    skip when `initialValues.linkedCashAssetId` is set. «Modifica» opens the dialog (lazy, criterion 18) with an
    `initialValues` frozen at the click; its `onSuccess(saved)` invalidates `expenses.all(ownerId)`, records
    `{ status: 'written', writtenIds: [saved.id] }` and sends the PATCH. Proof:
    `__tests__/expenseDialogInitialValues.test.tsx` (new, RTL, the four reads mocked): opened with `{ type: 'variable',
    categoryId, subCategoryId, amount: 103, linkedCashAssetId }` it shows step 2, 103, the subcategory and the
    proposal's account, not the default; the E2E «Modifica» → the dialog prefilled → «Salva» → the card «Registrata»
    and one row. Mutation: leave the subcategory-clear effect unchanged → the subcategory field is empty and the
    test fails.
15. **Cashflow reads `month=YYYY-MM`** (decision 59): `parseCashflowMonthParam(param)` (`lib/utils/period.ts`) returns
    `{ kind: 'month', year, month }` for a valid `YYYY-MM` (month 01–12, year 2000–2100) and `null` otherwise;
    Tracciamento's period starts from it, else from `currentMonthPeriod()`. Proof: `period.test.ts`
    («2026-10» → October 2026; «2026-13», «26-10», «» and `null` → `null`); the E2E follows «apri in Cashflow» on a row
    dated the 15th of the previous month and sees Tracciamento on that month's label. Mutation: ignore the param →
    the E2E sees the current month and fails.
16. **Memory extraction runs in `register` too, with two added sentences** in `EXTRACTION_SYSTEM_PROMPT`'s «Regole
    fondamentali»: «Una regola di categorizzazione detta dall'utente (“la palestra è Salute”) è una preference.» and
    «Una spesa o un'entrata che l'utente registra (importo, negozio, data) non è un fatto da memorizzare.». Proof:
    `assistantMemoryExtraction.test.ts`: the `system` sent to the mocked client contains both. Mutation: drop the
    second → the test fails.
17. **The whole Assistente page is under DESIGN.md § 5 «AI Surfaces»** (decision 26), in register and analysis modes:
    the verdict, the context panel, the thread list, the composer and the cards take the layout, spacing and type of
    the paragraph «The Assistente page» (its drawing: the Assistente scenes of `doc/ai/reference/concept-b.html`), and The AI-Accent Rule places the accent — on what the model wrote (each assistant
    message's role eyebrow «Assistente» accented and `data-generated`, the two proposal cards), on hover and
    focus-visible of every control that calls the model and never at rest (the composer's send, «Registra»,
    «Rigenera», the starter and follow-up rows — the rule's «a row of «Domande suggerite»»), nowhere else: the verdict and the panel are computed by code, the
    thread list and the memory are the user's, so they stay achromatic; the header's four icon actions
    (Conversazioni, Memoria, the preferences trigger, «Registra») are `h-11 w-11 desktop:h-9 desktop:w-9` and the
    primary `h-11 w-11 desktop:h-9 desktop:w-auto` (AGENTS.md § Accessibility). Proof: the E2E counts
    `[data-generated]` = assistant messages + proposal cards and finds none in the region «Verdetto sul contesto» nor
    in the companion column; phase E's screenshots against the mocks.
    Mutation: put `generated` on `RegistraContestoTile` → the count fails.
18. **The assistant route's first load stays in budget**: `ExpenseDialog` reaches the card only through
    `lazyComponent(() => import('@/components/expenses/ExpenseDialog').then((m) => m.ExpenseDialog))` at module level,
    preloaded on hover and focus of «Modifica». Proof: `npm run perf:budget` keeps `/dashboard/assistant` and
    `/dashboard/cashflow` within their ceilings in `perf/budget.json` (712 and 783 KB gz on 2026-11-03, measured 711,2 and
    782,9: under 1 KB of margin, so a raise stops the session for the owner, § 11). Mutation: a static import → the assistant route grows past
    its ceiling.
19. **Nothing else changes for the other modes** beyond the 4000 cap, the preview without fenced blocks, the header's
    44px actions and the accent: the analysis builders' `system`, `buildChatPrompt`'s output, the goal card's
    behaviour except its persisted state. Proof: the existing suites green (`assistantPromptBundle`,
    `assistantPromptRouting`, `assistantRoutes`, `anthropicStream`, `goalProposal`), no existing assertion rewritten.
20. **The page moves as the paragraph «The Assistente page» of DESIGN.md § 5 says** (decision 78, 2026-11-06): a
    change of mode — a period of «Periodo di analisi», «Registra», «Torna all'analisi» — keeps the «Conversazione» tile
    still and slides the companion column's content as a screen of the Consulente slides (`sceneVariants` of AI-03,
    forward from the right into Registra, back from the left; `sceneVariantsReduced` under reduced motion); the
    expense and goal cards enter with the question card's motion (`cardEnterVariants` of AI-03: y 8px → 0 · 0.2 s ·
    ease-out-quart; under reduced motion they appear). Proof: `__tests__/assistantCompanionScene.test.tsx` (new, RTL):
    the companion's wrapper carries `data-scene` equal to the mode and the «Conversazione» tile has none; under
    `MotionConfig reducedMotion="always"` the wrapper's style holds no `transform`; `expenseProposalCard.test.tsx`
    asserts the card's root is a `motion.div` with `cardEnterVariants`. Mutation: wrap the whole grid in the scene →
    the «no `data-scene` on the tile» assertion fails; drop the reduced branch → the `transform` assertion fails.
21. **Registra reads the CASHFLOW 12 MESI block like every other mode** (decision 82, 2026-11-07): the route's one
    `readCashflowBlockForPrompt(body.userId, now)` serves `register` too, and `buildRegisterPrompt` prints it after the
    register block, under its note, as `buildChatPrompt` does (a blank line, then
    `formatCashflowBlockSection(cashflowBlock).slice(0, 2)`), never in `system`; a failed read is the route's 500, as
    in every mode. Proof: `assistantPromptBundle.test.ts` (the note and the block between the register block and
    «Richiesta utente: …», `system` identical with and without it); `assistantRoutes.test.ts` (`register` →
    `fetchCashflowBlockInputs` called once with the owner's id, the block handed to `streamAssistantResponse`).
    Mutation: skip the read in `register` → the route test fails.

## 3. Decisions

- **Owner**: decisions 5, 9 (expenses and income here), 11, 16, 17, 18; of 2026-11-01: 21 (component tests in RTL),
  26 (the whole page under AI Surfaces), 28 (the month block), 58 (one thread per Italian day), 59 (`month=YYYY-MM`),
  60 (4000 characters), 61 (five cards), 62 (the browser panel), 63 (future dates); of 2026-11-07: 82 (the cashflow
  block in Registra too). **Adopted**: A9–A14 as amended in
  README § 4.
- **The month block's sources** (decision 28): the three totals come from `getDashboardOverview` — the Panoramica's
  read, fresh for the Italian day, invalidated by every create, so after a «Conferma» the next message sees the row.
  Its payload carries no split by type and no budget, so the type split is computed from the register's own rows and
  the Budget state with `lib/utils/budgetUtils.ts` over every row read (not only the 300 printed lines) plus
  `budgets/{uid}` — the Budget tab's layer, so the model's «sei al 90% del budget Cibo» matches rows by the tab's
  rules. The block counts the rows up to today («finora»); the tab also counts a row already in calendar later in the
  period, so the two figures differ by those rows only. The register window always covers January 1 (it
  starts eleven months back), so an annual budget's year-to-date is in it. The legacy back-fill of a budget item is
  ONE exported `normalizeBudgetItem` in `budgetUtils.ts` (the body of the three private copies,
  `lib/server/weeklyBudgetEmailService.ts:116`, `lib/server/budgetHistoryService.ts:23`,
  `lib/services/budgetService.ts:99` @ ce26af4d, which import it instead).
- **The model and its budget** (A9): Sonnet 5.5 at effort `high` (the Assistente's), `ASSISTANT_REGISTER_MAX_TOKENS =
  16000`, never a web search, the history capped as chat (20 messages), `currency: 'EUR'` always.
- **The type of a row is its category's** (`ExpenseCategory.type` is a required single `ExpenseType`,
  `types/expenses.ts:63-67` @ ce26af4d): the model picks a fixed, variable or income category and copies its type; a
  debt or transfer category is a problem in this spec (AI-06 opens them).
- **The amount** is a magnitude in euro (a JSON number with a dot), rounded to cents by the card; the service signs it.
- **The date** defaults to the Italian today; «ieri», «lunedì scorso» are the model's to resolve from the printed
  weekday and date; future dates are allowed and settle on their day (decision 63).
- **The thread of the day** (decision 58): created by the route on the first register message of an Italian day;
  a session left open across midnight keeps writing in the thread it entered.
- **The card's key** is `proposalKey(kind, index)`, the index the block's rank among the blocks of its language,
  derived from the stored text: the text never changes, so the key is stable across reloads.
- **One mechanism for both cards** (decision 18): the goal card migrates in THIS spec; its buttons go to
  `h-11 desktop:h-9` with the expense card's — its only visual change besides the accent.
- **A failed PATCH after a successful write** is a toast «La riga è registrata, ma la card non lo ricorda: dopo un
  ricaricamento non confermarla di nuovo.» (`PROPOSAL_STATE_NOT_SAVED`, `dialogNarrative.ts`); the session keeps
  «Registrata» (buffer and cache), a reload shows the card idle — a blind spot of the guide, the window being one
  failed request after a successful one.
- **Follow-up rows in Registra prefill the composer** («Registra una spesa di oggi» → «Oggi ho speso », «Registra lo
  stipendio» → «Ho ricevuto lo stipendio di ») instead of sending a prompt with no amount; Registra shows no starter
  rows (the analysis chips would leave the mode).
- **The browser and the server build ONE summary**: `summarizeRegisterContext` runs on both sides; the server's
  arrives with the `register` SSE event before the text and carries the recent count.
- **Where the zod schemas live**: `assistantStreamRequestSchema` and `proposalPatchSchema` in `lib/server/validation.ts`
  (the route schemas' module, `server-only`, tested by `serverValidation.test.ts`); `ASSISTANT_PROMPT_MAX_LENGTH`
  and `describePromptLength` in `lib/utils/assistantPeriodOptions.ts`, read by the composer and by the schema.

## 4. Solution

### Types (`types/assistant.ts`)

```ts
// WARNING: a new mode is handled EXPLICITLY at each of these (none may fall through to chat):
// - lib/server/validation.ts (assistantStreamRequestSchema's mode enum)
// - stream/route.ts (the context branch) and context/route.ts (a mode with no period: 400)
// - lib/services/assistantMonthContextService.ts (its context builder)
// - prompts.ts (its prompt builder) and anthropicStream.ts (buildPrompt, max_tokens, isStructuredAnalysis,
//   buildMessagesArray's history cap)
// - webSearchPolicy.ts (STRUCTURED_ANALYSIS_MODES, resolveAssistantWebSearchPolicy)
// - store.ts (getDefaultThreadTitle, buildThreadTitleFromPrompt)
// - assistantFollowUps.ts (CURATED_FOLLOW_UPS, a Record<AssistantMode, …>)
// - assistantPeriodOptions.ts (getActivePeriodLabel, buildComposerPlaceholder, buildEmptyStateQuestion,
//   findThreadForPeriod, getModeBadgeLabel)
// - AssistantPeriodSelector.tsx (PERIOD_TABS: a mode with no period is NOT a tab)
// - useAssistantStreaming.ts (buildStreamRequestBody) and useAssistantPeriodContext.ts (the period preview)
export type AssistantMode = 'month_analysis' | 'year_analysis' | 'ytd_analysis' | 'history_analysis' | 'chat' | 'register';
export interface AssistantProposalState { status: 'written' | 'ignored' | 'answered'; writtenIds?: string[]; answer?: string; at: Date } // 'answered'/answer: AI-06
export interface AssistantMessage { /* …today's fields… */ proposals?: Record<string, AssistantProposalState> }
export interface AssistantRegisterSummary {
  accounts: { id: string; name: string; balance: number; roles: ('addebito' | 'accredito')[] }[];
  categories: number;
  costCentersEnabled: boolean;
  membersEnabled: boolean;
  recent: { rows: number; cut: number } | null; // null: computed in the browser, before the server answered
}
export type AssistantStreamEvent = /* …today's… */ | { type: 'register'; summary: AssistantRegisterSummary };
```

`AssistantStreamRequest` is unchanged (`register` sends no `month`, `year` nor `chatContext`; `buildStreamRequestBody`
needs no branch).

### `lib/utils/assistantRegisterContext.ts` (pure, shared with AI-06)

```ts
export const REGISTER_RECENT_ROWS_CAP = 300;
export const REGISTER_RECENT_MONTHS = 12;
export const REGISTER_MONTH_BUDGET_ROWS_CAP = 20;
export interface RegisterMonthInput {
  stats: DashboardOverviewExpenseStats | null; // getDashboardOverview(...).expenseStats; null = the read failed
  budget: BudgetConfig | null;                 // budgets/{uid}, items through normalizeBudgetItem; null = none
  budgetFailed: boolean;
}
export interface AssistantRegisterContextInput {
  now: Date;
  categories: ExpenseCategory[];
  assets: Asset[];
  settings: Pick<AssetAllocationSettings, 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId' | 'costCentersEnabled' | 'expenseSplitEnabled' | 'familyMembers'> | null;
  costCenters: CostCenter[];         // all of them; the builder keeps those without archivedAt
  recentExpenses: Expense[] | null;  // the window's rows (server); null in the browser (decision 62)
  month: RegisterMonthInput | null;  // null in the browser
  assetValueOf: (asset: Asset) => number; // injected: calculateAssetValue imports the client Firebase config
}
export interface RegisterRecentRow {
  dateIso: string; type: ExpenseType; amount: number; // magnitude
  categoryId: string; categoryName: string; subCategoryId: string | null; subCategoryName: string | null;
  accountId: string | null; accountName: string | null; costCenterName: string | null; memberName: string | null;
  note: string | null; excludeFromBudget: boolean; debtAssetId: string | null; recurringParentId: string | null;
  series: { count: number; frequency: RecurrenceFrequency } | null; // the series collapsed to its newest occurrence
}
export interface AssistantRegisterContext {
  today: { iso: string; label: string }; // «domenica 1 novembre 2026»
  categories: { id: string; name: string; type: ExpenseType; proposable: boolean; subCategories: { id: string; name: string }[] }[];
  accounts: AssistantRegisterSummary['accounts']; // buildCashAccountLines(assets, settings, assetValueOf)
  defaults: { debitId: string | null; creditId: string | null }; // null when unset or not a listed account
  costCenters: { enabled: boolean; items: { id: string; name: string }[] };
  members: { enabled: boolean; items: { id: string; name: string }[] };
  recent: { rows: RegisterRecentRow[]; read: number; cut: number; sinceIso: string } | null;
  month: {                           // the IL MESE lines (criterion 5); null in the browser
    label: string;                   // «novembre 2026»
    totals: { income: number; expenses: number; scheduled: number; net: number } | null; // null: the overview read failed
    byType: { type: 'fixed' | 'variable' | 'debt'; amount: number }[]; // the Italian month's rows up to today
    budgets: { label: string; spent: number; ceiling: number; ratio: number; period: BudgetPeriod }[] | 'failed' | 'none';
    budgetsCut: number;              // the budget lines past REGISTER_MONTH_BUDGET_ROWS_CAP
    overall: { spent: number; ceiling: number; ratio: number } | null; // BudgetConfig.overallMonthlyAmount
  } | null;
}
export function buildAssistantRegisterContext(input: AssistantRegisterContextInput): AssistantRegisterContext;
export function formatRegisterContextForPrompt(ctx: AssistantRegisterContext): string;
export function summarizeRegisterContext(ctx: AssistantRegisterContext): AssistantRegisterSummary;
```

The block's sections, in order: «--- REGISTRA ---» with the today line; «--- CATEGORIE ---»; «--- CONTI ---» with the two
defaults named; «--- CENTRI DI COSTO ---»; «--- INTESTATARI ---»; «--- ULTIME RIGHE ---» (`dateIso · tipo · importo ·
Categoria [id] › Sottocategoria [id] · Conto [id] · centro · intestatario · «nota» · fuori budget · serie ×N`, the
window's first day and the count read); «--- IL MESE ---» (criterion 5). Amounts in the block are
`formatNumberIt(value, 2) + ' €'` (`lib/utils/formatters.ts:171` @ ce26af4d); the series frequency through
`resolveRecurrenceFrequency`. `buildCashAccountLines` lives in `lib/utils/cashflowBlock.ts` (X-F11): its line carries
`id`, and Registra needs every cash account, a zero balance included, because the user may name it.

### `lib/utils/expenseProposal.ts` (pure, shared with AI-06)

```ts
export const EXPENSE_PROPOSAL_LANGUAGE = 'expense-proposal';
export const EXPENSE_PROPOSALS_MAX_PER_MESSAGE = 5;
export const expenseProposalSchema = z.object({
  kind: z.enum(['expense', 'income']),             // AI-06 adds 'transfer' | 'debt'
  type: z.enum(['fixed', 'variable', 'income']),
  amount: z.number().positive().max(1_000_000),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate), // module-private: round-trips through Date.UTC
  categoryId: z.string().min(1), subCategoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(), costCenterId: z.string().min(1).optional(), memberId: z.string().min(1).optional(),
  excludeFromBudget: z.boolean().optional(), note: z.string().max(200).optional(), reason: z.string().min(1).max(240),
}).refine((p) => (p.kind === 'income') === (p.type === 'income'), { message: 'kind/type disagree' });
export type ExpenseProposal = z.infer<typeof expenseProposalSchema>;
export function parseExpenseProposal(raw: string): ExpenseProposal | null;
export function proposalKey(kind: 'expense' | 'goal' | 'question', index: number): string; // 'expense:0'
/** Every fenced block of a message: its language, the offset of its opening fence, its rank among its language's blocks. */
export function listFencedBlocks(content: string): { language: string; offset: number; index: number }[];
/** The message without its fenced blocks (the thread list's preview). */
export function stripFencedBlocks(content: string): string;
export interface ExpenseProposalRefs {
  categories: ExpenseCategory[]; cashAssets: Asset[]; properties: Asset[]; costCenters: CostCenter[]; members: FamilyMember[];
  defaults: { debitId: string | null; creditId: string | null }; loans: Asset[]; feeCategory: ExpenseFeeCategory | null;
  settings: { costCentersEnabled: boolean; expenseSplitEnabled: boolean };
} // properties, loans, feeCategory: [] / [] / null in this spec, filled by AI-06
export interface ResolvedExpenseProposal { form: Partial<ExpenseFormData>; labels: Record<string, string>; problems: string[]; dropped: string[] }
export function resolveExpenseProposal(p: ExpenseProposal, refs: ExpenseProposalRefs, now: Date = new Date()): ResolvedExpenseProposal;
export interface ExpenseProposalCardState { status: 'idle' | 'saving' | 'written' | 'ignored' | 'interrupted'; line: string | null; canConfirm: boolean; canEdit: boolean; canIgnore: boolean }
export function describeExpenseProposalState(
  resolved: ResolvedExpenseProposal,
  persisted: AssistantProposalState | undefined,
  local: { messageId: string; saving: boolean; readFailed: boolean; isDemo: boolean },
): ExpenseProposalCardState;
```

`labels` keys: `kind` («Spesa»/«Entrata»), `amount`, `category` («Cibo › Spesa»), `categoryName`, `subCategoryName`,
`date` («oggi», «ieri», `DD/MM/YYYY` via `formatDate`), `settlement` (decision 63's sentence, future dates only),
`account` (the name, or «nessun conto: il saldo non si muove»), `costCenter`, `member`, `budget` («fuori budget»).
`listFencedBlocks` scans lines: an opening fence is three or more backticks or tildes after at most three spaces of
indentation, the info string's first word its `language`; the block closes at a line of the same character at least
as long (after at most three spaces) or at the end of the content; a fence line inside an open block is content, and a
fence that follows `>` and one that follows a list marker on its line are not listed. `offset` is the fence's first
backtick or tilde — the offset react-markdown's hast `pre` node carries in `position.start.offset` for that block.

### Server

- `lib/server/assistant/prompts.ts`: `REGISTER_CONTRACT` (Italian, read with the owner in phase B), with these clauses:
  the block's fields with their types and bounds, listed as the goal protocol lists its own (`prompts.ts:740-747` @
  b9411a4d), and «SOLO JSON valido»; «Un blocco per ogni
  riga che l'utente nomina, al massimo cinque: se ne nomina di più, proponi le prime cinque e scrivi “Ne restano N: vuoi
  che continui?”»; «amount è un numero JSON in euro con il punto decimale, senza separatori di migliaia né simbolo»;
  «gli id si copiano dai blocchi, mai inventati»; «scegli la categoria fra quelle di tipo Spese Necessarie, Spese Non
  Necessarie o Entrate e copia il suo tipo; segui il modo di categorizzare dell'utente nelle ULTIME RIGHE e scrivi in
  reason quali righe»; «il conto è il predefinito del tipo, salvo che l'utente ne nomini un altro»; «la data è oggi,
  salvo che l'utente dica altro: risolvi “ieri”, “lunedì scorso” dalla data di oggi; una data futura è ammessa»;
  «senza importo non emettere il blocco: chiedilo in prosa»; «In questa modalità non proporre obiettivi»; «dopo una
  riga puoi commentarla con IL MESE (per esempio il budget della sua categoria), senza inventare cifre»; «ogni blocco
  sta su righe sue, fuori da elenchi e citazioni»; «le righe proposte nei messaggi precedenti l'utente le ha già
  confermate o ignorate: non riproporle, salvo che te lo chieda».
  `buildRegisterPrompt(prompt, preferences, memoryItems, registerBlock, cashflowBlock: string | null)` →
  `{ system: `${ASSISTANT_SYSTEM_CORE}\n\n${REGISTER_CONTRACT}`, userContent }`, `userContent` = the response-style line, the memory block exactly as `buildChatPrompt` builds it
  (`prompts.ts:1032-1034` @ ce26af4d), the register block, the cashflow block under its note (criterion 21),
  «Richiesta utente: …».
- `anthropicStream.ts`: `ASSISTANT_REGISTER_MAX_TOKENS = 16000` beside the other two (`:21-22` @ ce26af4d);
  `StreamAssistantResponseArgs.registerBlock?: string | null`; `buildPrompt` routes `register` first;
  `max_tokens` takes the register budget; `isStructuredAnalysis` unchanged.
- `webSearchPolicy.ts`: `resolveAssistantWebSearchPolicy` returns `false` for `register` before any other test.
- `lib/server/validation.ts`: `assistantStreamRequestSchema` (criterion 2); `proposalPatchSchema` = `{ userId: min 1;
  key: /^(expense|goal|question):\d+$/; status: 'written' | 'ignored' | 'answered'; writtenIds?: string[] (≤ 60, each
  min 1); answer?: string (≤ 2000) }` with `answer` present only when `status === 'answered'`.
- `stream/route.ts`: `parseOr400(assistantStreamRequestSchema, await request.json())` replaces the cast and the empty
  prompt check; `register` → `fetchRegisterInputs(userId, now)` → `buildAssistantRegisterContext` → the block, then
  `{ type: 'register', summary }` after `meta` and before the text; the cashflow block read as in every mode
  (criterion 21); `enableWebSearch` false; thread creation with
  `buildThreadTitleFromPrompt(prompt, mode, now)`; metadata: a register thread keeps its title, every mode's preview
  through `stripFencedBlocks`. A rejection of `fetchRegisterInputs`' core reads is today's 500 «Impossibile avviare lo
  stream dell'assistente» (`:411-415` @ ce26af4d), before any event.
- `lib/services/assistantMonthContextService.ts`: `fetchSettings` (`:169-193` @ ce26af4d; it already maps
  `defaultDebitCashAssetId` and `defaultCreditCashAssetId` for the account lines, since 2026-11-07) maps also `costCentersEnabled`,
  `expenseSplitEnabled` (read here) and
  `transferFeeCategoryId`, `transferFeeSubCategoryId`, `assistantMemoryEnabled` (read by AI-06; the memory switch's
  settings field is `assistantMemoryEnabled`, `types/assets.ts:421` @ ce26af4d — this spec's prompt follows
  `preferences.memoryEnabled`, as `buildChatPrompt` does); `fetchCostCenters(userId)` (Admin, `costCenters` where
  `userId`); `export async function fetchRegisterInputs(userId: string, now: Date): Promise<AssistantRegisterContextInput>`
  — `Promise.all` of categories, assets, settings, cost centres and `fetchExpenses(userId, start, end)` with `start =
  getItalyMonthBoundsUtc(year, month).start` of the month eleven back and `end = getItalyDayBoundsUtc(now).end`, then
  `Promise.allSettled` of `getDashboardOverview(userId, { now })` and the `budgets/{uid}` read, `assetValueOf:
  calculateAssetValue`.
- `lib/utils/budgetUtils.ts`: `export function normalizeBudgetItem(raw: BudgetItem & { monthlyAmount?: number }): BudgetItem`
  (§ 3), imported by the three former copies.
- `store.ts`: `getDefaultThreadTitle` exported, `register` → «Registrazioni»; `buildThreadTitleFromPrompt(prompt, mode, now = new Date())`;
  `mapMessage` maps `proposals` (each `at` through `toDate`); `appendAssistantMessage` unchanged (a new message has
  no proposals); `setAssistantMessageProposal(userId, threadId, messageId, key, state: Omit<AssistantProposalState, 'at'>)`
  = `getAssistantThread(threadId, userId)` (404/403), the message document read (missing → `AssistantStoreError(404,
  'Messaggio non trovato')`), `update(new FieldPath('proposals', key), { ...state, at: Timestamp.now() })`.
- `app/api/ai/assistant/threads/[threadId]/messages/[messageId]/route.ts` (new): `PATCH` → token, `parseOr400(proposalPatchSchema)`,
  `assertCanAccessAccount(decodedToken, body.userId)`, `setAssistantMessageProposal`, `{ proposal }`; store errors
  mapped as the thread route does.
- `app/api/ai/assistant/context/route.ts`: `mode === 'register'` → 400 (criterion 1).
- `memoryExtraction.ts`: the two sentences (criterion 16).

### Client

- `lib/utils/assistantStreamBuffer.ts` (new, pure): `adoptStreamMessageId(messages, localId, done: { messageId?: string; threadId?: string })`
  (the local message takes the server id and thread id; without `messageId` nothing changes) and
  `applyProposalToMessages(messages, messageId, key, state)`.
- `useAssistantStreaming.ts`: the `done` handler applies `adoptStreamMessageId`; the `register` event sets
  `registerSummary` (cleared by `resetStream` and at each submit); the hook returns `registerSummary` and
  `recordProposal(messageId, threadId, key, state)` (the buffer through `setStreamingMessages`, the cache through
  `queryClient.setQueryData(queryKeys.assistant.thread(threadId), …)`).
- `useAssistantThreads.ts`: `normalizeThreadDetail` maps `proposals[key].at` through `toDate` (`:28` @ ce26af4d).
- `components/assistant/MessageIdContext.tsx` (new): `MessageIdProvider({ message, mode, recordProposal, children })`
  (`recordProposal` already bound to the message's id and thread), `useMessageId(): { messageId: string; proposals:
  Record<string, AssistantProposalState>; recordProposal(key, state): void }` and, for the interceptor,
  `useMessageBlocks(): { blocks: { language: string; offset: number; index: number }[]; mode: AssistantMode }`
  (`listFencedBlocks(message.content)`, memoized by the compiler on the content). `AssistantStreamingResponse` wraps
  each assistant message's `ReactMarkdown` in it. The module-level `pre` interceptor reads its hast
  `node.position.start.offset` and takes the block whose `offset` equals it; its `index` is the card's. No matching
  block → code; an ```expense-proposal block renders as a card only when `mode === 'register'` and its index is
  below 5, else as code; a ```goal-proposal block keeps today's path with its key.
- `components/assistant/RegisterRefsContext.tsx` (new): `useRegisterReads(ownerId, enabled)` — `useExpenseCategories`,
  `useAssets`, `useSettings`, `useCostCenters` with `{ enabled }` (the keys every page shares) → `{ refs: ExpenseProposalRefs; readFailed; loading; summary }`
  (the summary = `summarizeRegisterContext(buildAssistantRegisterContext({ …, recentExpenses: null, month: null, assetValueOf: calculateAssetValue }))`);
  `RegisterRefsProvider`, `useRegisterRefs(): ExpenseProposalRefs & { readFailed: boolean; submitAnswer: (text: string) => Promise<void> }`
  (`submitAnswer` = `streaming.submit(text)`, consumed by AI-06). The page enables the reads when `mode === 'register'`,
  the one mode in which the interceptor renders an expense card (`useMessageBlocks().mode`); a register thread is
  shown only in register mode (the thread sync sets the mode from the thread).
- `components/assistant/ExpenseProposalCard.tsx` (new, criteria 7–10, 14): props `{ proposal: ExpenseProposal; index: number }`;
  `resolveExpenseProposal` + `describeExpenseProposalState`; a local `const confirm = async () => {…}` whose `try`
  holds no branch (AGENTS.md § React Compiler and the hooks rules, the React Compiler rewrites), the three service calls in the module-level
  `writeExpenseProposal(ownerId, resolved, now)` that returns the ids: `setSaving(true)` → the write → `recordProposal`
  → toast → the four invalidations → the PATCH (its failure: `PROPOSAL_STATE_NOT_SAVED`) → the focus on the state
  line (`tabIndex={-1}`); a write failure shows
  `describeWriteError(error)` in the card and re-enables «Conferma». «Ignora» records and PATCHes `ignored`. «Modifica»
  freezes `resolved.form` in state and mounts the lazy dialog with `returnFocusTo` = the «Modifica» button's ref. The
  card reads `useDemoMode()` and disables «Conferma» and «Modifica» there, a second guard behind the locked page.
- `GoalProposalCard.tsx`: its state from `useMessageId().proposals[proposalKey('goal', index)]` (props gain `index`);
  «Conferma» records `{ status: 'written', writtenIds: [goal.id] }` from the `{ goal }` the route answers, «Ignora»
  `ignored`; the labels unchanged; the root takes the accent (criterion 17); buttons `h-11 desktop:h-9`.
- `AssistantComposer.tsx`: `maxLength`, the counter (criterion 3), `inputRef?: RefObject<HTMLTextAreaElement | null>`
  (the page's, for the focus), the send button hover-accented.
- `AssistantHeader.tsx` and `AssistantPreferencesPopover.tsx`: the «Registra» action and `onEnterRegister`; the four
  icon actions and the primary 44px below `desktop:` (criterion 17).
- `AssistantPageClient.tsx` (criterion 20): the companion column's content (`companionTiles`, :457-458 @ ce26af4d, and
  `RegistraContestoTile` in Registra) inside `AnimatePresence mode="wait"` → `motion.div` keyed by the mode, with
  `variants={reduced ? sceneVariantsReduced : sceneVariants}`, `custom` = the direction (forward into Registra and on a
  later period, back on «Torna all'analisi» and an earlier period), `data-scene={mode}`; the grid, the
  «Conversazione» tile and the composer outside it; the first render does not animate (`initial={false}`).
  `ExpenseProposalCard` and `GoalProposalCard` render their root as `motion.div` with `cardEnterVariants`.
- `AssistantPageClient.tsx`: `enterRegister()` (criterion 11) from the header and, once, from `?mode=registra`
  (`useSearchParams`, as `app/dashboard/cashflow/page.tsx:102` @ ce26af4d reads its params; a one-shot state settled
  with the deferred shape of the thread sync effect, `:248-265` @ ce26af4d, after `useAssistantThreads` resolves);
  `app/dashboard/assistant/page.tsx` stays a static page (a `searchParams` prop would make the route dynamic and drop it
  from `perf:budget`, which reads prerendered HTML). In `register`: the verdict `buildRegisterVerdict(registerSummary ?? reads.summary)`,
  the strip instead of `AssistantPeriodSelector`, `RegistraContestoTile` instead of the period tiles (above
  `MemoriaTile`), `promptRows = []` and the tile renders no «Domande suggerite» list when it is empty,
  `onFollowUpSelect` prefills `setDraft(prompt)` and focuses the composer, `RegisterRefsProvider` around the grid.
- `components/assistant/tiles/RegistraContestoTile.tsx` (new): criterion 13.
- `AssistantThreadList.tsx`: imports `getModeBadgeLabel`.
- `AssistantStreamingResponse.tsx`: props gain `mode`, `threadId` and `recordProposal` (the hook's, passed by
  `AssistantConversazioneTile`); one `MessageIdProvider` per assistant message, the derived index, the assistant role
  eyebrow accented with `data-generated` (criterion 17).
- `lib/constants/aiAccent.ts` (AI-03): `AI_GENERATED_SURFACE_CLASS` and `AI_GENERATED_EYEBROW_CLASS` are the
  classes `Tile generated` applies, read here by the surfaces that are not tiles (the messages, the cards);
  `AI_CONTROL_ACCENT_CLASS` is the hover/focus-visible accent of a control that calls the model («Registra»,
  «Rispondi», the composer's send). No new constant is created here.
- `ExpenseDialog.tsx`: `initialValues` (criterion 14); the dialog's own toasts unchanged.
- `lib/utils/assistantNarrative.ts`: `buildRegisterVerdict(summary: AssistantRegisterSummary | null): PageVerdictModel`;
  `describeConversation` gains `mode`: in `register`, empty → «Cosa vuoi registrare? Scrivi qui sotto la spesa o
  l'entrata.», else «N messaggi; le righe proposte si scrivono solo su Conferma.».
- `lib/utils/dialogNarrative.ts`: `ROW_CREATED_TOAST = { expense: 'Spesa creata con successo', income: 'Entrata creata con successo' }`,
  `PROPOSAL_STATE_NOT_SAVED`.
- `app/dashboard/cashflow/page.tsx`: `useState<Period>(() => parseCashflowMonthParam(searchParams.get('month')) ?? currentMonthPeriod())`.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **`ASSISTANT_SYSTEM_CORE` is shared with the emails** (AGENTS.md § Assistant · Assistente) — here it means the
  contract is appended in `buildRegisterPrompt` only, «In questa modalità non proporre obiettivi» neutralises the
  core's goal protocol for this mode, and the gates are `not.toContain` and `toBe` on `system`.
- **`system` byte-identical per mode** — the ids, names, rows and month figures are `userContent`.
- **The silent-cap rule** — every cut is printed: 300 lines, 20 budgets; no cap on categories, accounts, centres or
  members.
- **Every expense window is an Italian calendar window** — the recent rows from `getItalyMonthBoundsUtc` to
  `getItalyDayBoundsUtc(now).end`; the title's date and `findRegisterThread` in the Italian zone; the suites run in
  three zones (CLAUDE.md § Current Status).
- **The React Compiler** (AGENTS.md § React Compiler and the hooks rules) — the block index is derived, never a render counter; the card's write
  is a module-level helper awaited from a local `const confirm`; `MARKDOWN_COMPONENTS` stays module-level and reads
  context through hooks; `reactCompilerCoverage` compiles every new file.
- **Dialog Form Reset and Two-Step Create Dialogs** (`doc/guide/dialog.md`) — `initialValues` joins the `(open,
  record)` subject; the new-row branch still enumerates every field; the card freezes the value it passes, or a
  refetch would reset the user's edits.
- **React Query and Derived State** — the four invalidations of A10, `expenses.all(ownerId)` being the prefix of every
  window (Tracciamento's period, Budget's year); the local outcome written into the buffer and the cache, because the
  buffer wins until a thread switch.
- **Accessibility** — no new `aria-live`: the cards sit inside the conversation's polite region, which announces
  «Registrata»/«Ignorata» when the line replaces the buttons, and the focus moves to that line; 44px buttons; the
  counter by `aria-describedby`.
- **Demo** — the page is `AssistantLockedState`, no card renders; the card's demo guard is a second line without E2E.
- **Shared account** — a co-owner writes with `ownerId`, as the dialog does (the rules and `assertCanAccessAccount`
  admit a member); the PATCH sends the `ownerId` the stream sends (`useAssistantStreaming.ts:48` @ ce26af4d) and
  `getAssistantThread` refuses a thread of another account; the memory items land where they land today.
- **E2E** (decision 39, `doc/guide/e2e-emulatori.md`) — the page needs `ANTHROPIC_API_KEY` from `.env.local` in the
  `dev:e2e` server to render the composer; `page.route('**/api/ai/assistant/stream', …)` fulfils every stream with a
  fake SSE body (`meta` with the planted thread id, `register` with a summary of 4 recent rows, one `text` event with
  the planted message's content, `done` with the planted message id), so the key is never spent; the spec plants
  through the Admin SDK (`async function admin()`, as `e2e/assets.compravendita.spec.ts:41-45` @ ce26af4d) the ids
  prefixed `e2e-reg-`: the category «Cibo» (`variable`) › «Spesa», «Salute» (`fixed`) › «Farmacia», the cash asset
  «Conto principale», `defaultDebitCashAssetId` and `defaultCreditCashAssetId` on it, the thread of today and its two
  messages per test, and the decoy row «ornitorinco»; `afterAll` removes them and restores the settings fields.
  Amounts are asserted with the guide's euro regex and U+202F/U+00A0 flattened on both sides (§ Browser-Driven E2E →
  «Numbers on the page»), never a literal «103,00 €».
- **No owner data** — invented fixtures only; phase F runs on the mirror.
- **Edge cases, each with its rule**: two rows in one message → two cards `expense:0`/`expense:1`, two states
  (criterion 10); a stream stopped or failed before `done` → `local-` id, no buttons; a reload before «Conferma» →
  idle and writable once; a double click → one row (`saving`); an amount with a comma → invalid JSON, the block renders
  as code; «ieri» on the 1st → the previous month's date, the link opens that month; a future date → pending row; no
  categories → «Nessuna categoria configurata» in the block and the model asks in prose to create one in Impostazioni ›
  Spese; no account → «nessun conto: il saldo non si muove»; the core Admin read failing → 500 before the stream; the
  month reads failing → their sentences, the stream goes on; centres or Divisione off → the field dropped with its
  «ignorato» line; more than 100 messages in the day's thread → the thread shows its oldest 100 and the history is cut
  from those (`getAssistantThreadDetail`, `store.ts:266-283` @ ce26af4d, unchanged: a guide blind spot); a session
  across midnight → the thread it entered; the flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED='false'` → the page 404s, so the
  action and the param do not exist.
- **Cases that do not change**: the rate limit (30 streams an hour per warm instance, shared by every mode); the
  dialog's own toasts; the thread list's 50-per-page pagination; `buildStreamRequestBody` (register sends no period);
  `useAssistantPeriodContext` (never enabled for register: `shouldFetchContext` lists the four analysis modes); the
  tablet (no spec: the 390 spec and the 1440 spec cover the two layouts the page has); the email prompts; the goal
  card's `POST`/`PATCH /api/goals`.

## 6. Tests per level (with the mutation that proves each)

Pure (`.test.ts`, node):
- `__tests__/assistantRegisterContext.test.ts` (new): criteria 4, 5. Mutation: sort ascending → the cut drops the
  newest rows.
- `__tests__/expenseProposal.test.ts` (new): criteria 6, 7 and `describeExpenseProposalState` (a `local-` id →
  `interrupted`, no buttons; `written` → no buttons; `readFailed` → `canConfirm` false), `stripFencedBlocks`.
  Mutation: `listFencedBlocks` ranking across languages → `goal:0` becomes `goal:5`.
- `__tests__/assistantStreamBuffer.test.ts` (new): criterion 10. Mutation: adopt the id on every message → the user
  message loses its id and the test fails.
- `assistantPromptBundle.test.ts`: criterion 6's prompt half and criterion 21's. Mutation: interpolate the date in `REGISTER_CONTRACT` →
  `expect(a.system).toBe(b.system)` fails.
- `assistantRoutes.test.ts`: criteria 1 (context route), 2, 12 (title kept, preview), 21. Mutation: keep the cast →
  `mode: 'weekly'` reaches the chat builder.
- `assistantThreadRoutes.test.ts`: criterion 12, `getDefaultThreadTitle('register')`. Mutation: process-zone date.
- `__tests__/assistantMessageRoute.test.ts` (new) and `assistantThreadsStore.test.ts`: criterion 10's server half.
  Mutation: write with `set(…, { merge: true })` → the store test's `update`-with-the-field-path assertion fails.
- `anthropicStream.test.ts`, `assistantPromptRouting.test.ts`, `assistantFollowUps.test.ts`,
  `assistantPeriodOptions.test.ts`, `assistantNarrative.test.ts`, `assistantMemoryExtraction.test.ts`,
  `assistantMonthContextService.test.ts`, `serverValidation.test.ts`, `period.test.ts`, `budgetUtils.test.ts`
  (`normalizeBudgetItem`: a legacy `monthlyAmount` item → `amount`): criteria 1, 3, 5, 11, 13, 15, 16.
- `reactCompilerCoverage.test.ts`: green with the new components.

Components and hooks (`.test.tsx`, jsdom, RTL — decision 21):
- `__tests__/expenseProposalCard.test.tsx` (new), `__tests__/goalProposalCard.test.tsx` (new),
  `__tests__/assistantStreamingResponse.test.tsx` (new: two expense blocks and one goal block receive `expense:0`,
  `expense:1`, `goal:0`; six expense blocks → five cards), `__tests__/expenseDialogInitialValues.test.tsx` (new),
  `__tests__/assistantCompanionScene.test.tsx` (new: criterion 20, its two mutations),
  `__tests__/assistantComposer.test.tsx` (new), `__tests__/useAssistantStreaming.test.tsx` (new, `renderHook` in a
  `QueryClientProvider`, `authenticatedFetch` mocked to answer an SSE `Response`).

Browser (Playwright, the stream always faked):
- `e2e/assistant.register.spec.ts` (new, 1440): the header action and the strip; the panel before any message; the
  owner's sentence of the header → card → «Conferma» → the Admin reads; the two-card sentence (decision 61); «Modifica»
  → prefilled dialog → saved; the future-dated card; «apri in Cashflow» on the previous month (decision 59); the reload
  on `?mode=registra`; «Torna all'analisi»; the `[data-generated]` count; the decoy «ornitorinco» untouched.
- `e2e/assistant.register.mobile.spec.ts` (new, 390): the card's three buttons wrapping, the overflow guard, «Conferma»
  → the row.

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: `node -v` prints v24 (decision 33); the nineteen criteria; the outcome «“ho fatto spesa per 103 euro” becomes
  a card; Conferma writes one row through the services; a reload cannot write it twice».
- **B**: the `REGISTER_CONTRACT`, the two extractor sentences and the card's copy read with the owner.
- **C**: `npx tsc --noEmit`, `npm run lint` (0 warnings, as today), Vitest in `Europe/Rome`, the machine's zone and
  `TZ=UTC` (the suites of § 6), the two E2E specs with the emulators up, `npm run perf:budget` (criterion 18).
  `mobile:census`/`mobile:budget` are not run: `perf/mobile-budget.json` has no `assistant` surface (the Assistente
  has no composition, by design: `doc/guide/assistente.md` § Composizione mobile) and Tracciamento's first screen does
  not change (the param only picks the period).
- **D**: the emulator documents the spec reads (the `expenses` rows, the account's `quantity`, the message's
  `proposals`); `fetchRegisterInputs` against the emulator seed in a throwaway `__tests__/zz-emulator-register.test.ts`
  (`vi.mock('server-only')`, `FIRESTORE_EMULATOR_HOST` set): the window's first row, the month block's lines.
- **E**: screenshots at 390, 768, 1024×768 and 1440 of the page in register (empty, the panel, a card idle, written,
  with a problem, interrupted, future-dated) and in `month_analysis` (the restyle), set against the Assistente scenes of `doc/ai/reference/concept-b.html`.
- **F** (at the owner's «pronto»): on the mirror (`npm run mirror:seed -- <email>`) with the owner's key, the owner
  types the sentence of the header, «stipendio di 2.000 ieri», «benzina 60 euro fuori budget» and the two-row
  sentence of decision 61; confirms the first; opens Tracciamento from the card; reloads the thread; asks «come sono
  messo col budget Cibo». The owner's wording for the card.
- **G**: `npm run mirror:remove`; the throwaway test and the screenshots deleted; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

Branch `feat/assistente-registra`, commit `feat(assistente): Registra — a mode that proposes a row and writes it on
Conferma, once`, PR to `develop`, the preview for the owner. The Assistente's `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`
already gates the page; no new flag.

## 9. Documentation

- `doc/guide/assistente.md` (English since this session, decision 35):
  - the header's «No permanent E2E spec: both blocks state «no Playwright spec» (the throwaway specs were deleted — see
    *Per-page blind spots*).» → «E2E: `e2e/assistant.register.spec.ts` and `e2e/assistant.register.mobile.spec.ts`
    (Registra, the stream always faked with `page.route`); the analysis modes have no Playwright spec.»;
  - § Files: `lib/utils/{expenseProposal,assistantRegisterContext,assistantStreamBuffer}.ts`,
    `components/assistant/{ExpenseProposalCard,MessageIdContext,RegisterRefsContext}.tsx`,
    `components/assistant/tiles/RegistraContestoTile.tsx`, `app/api/ai/assistant/threads/[threadId]/messages/[messageId]/route.ts`;
  - a new section «## Registra (2026-11)»: the mode and its WARNING list, the register block and its ids, IL MESE and
    its two sources, the protocol and its five-block cap, the card and its states, the write path, `proposals` and the
    PATCH, the derived key, the header action, the strip, the thread of the day, the verdict and the panel;
  - «Rows, not chips, inside a tile: … a follow-up submits directly.» → «… a follow-up submits directly, except in
    Registra, where it prefills the composer.»; the § Per-page blind spots line «starter rows prefill the composer,
    follow-up rows submit» → «… follow-up rows submit (in Registra they prefill)»;
  - «Layout: … verdict + `AssistantPeriodSelector` …» gains «(in Registra the strip with «Torna all'analisi» in its
    place, `RegistraContestoTile` in the companion)»;
  - «Messages are flat … `GoalProposalCard` is a `not-prose` muted sub-tile (never a card in the tile)» → «the proposal
    cards (`GoalProposalCard`, `ExpenseProposalCard`) are `not-prose` blocks with the AI accent (DESIGN.md → The
    AI-Accent Rule), never a card in the tile»;
  - «the header has three icon actions and ONE primary» → «four icon actions (Registra, 2026-11) and ONE primary»;
  - § The visual direction: «The code follows it from the Registra mode on (AI-05).» → «The code follows it from the
    Registra mode on (2026-11): the companion slides with `sceneVariants`, the cards enter with `cardEnterVariants`.»;
  - § Per-page blind spots: «**Assistente**: no Playwright spec (the throwaway specs were deleted); …» → «**Assistente**:
    the analysis modes have no Playwright spec; …»; «A confirmed goal proposal can be confirmed again after a reload
    (accepted for v1)…» → «A card's outcome is saved on its message (2026-11): a reload shows «Obiettivo creato» /
    «Registrata». The one window left: a PATCH that fails after a successful write (the toast says so); a reload then
    shows the card idle.»; new: «A Registra day past 100 messages shows its oldest 100 (`getAssistantThreadDetail`
    reads `orderBy createdAt asc, limit 100`), and the history is cut from those.»; «A row written from Registra
    carries no mark: in Tracciamento it is a row like any other.»
- `doc/guide/cashflow-tracciamento.md` § Files: «`app/dashboard/cashflow/page.tsx`;» → «`app/dashboard/cashflow/page.tsx`
  (`?tab=`, `?owner=` and, since 2026-11, `?month=YYYY-MM` — the Tracciamento period on open, `parseCashflowMonthParam`
  in `lib/utils/period.ts`, the link of the Assistente's card);».
- `doc/guide/dialog.md` § Two-Step Create Dialogs: «**Create opens on step 1, edit skips to step 2**» → «**Create opens
  on step 1 — on step 2 when `initialValues.categoryId` names a category (`ExpenseDialog`, the Assistente's «Modifica»,
  2026-11) — edit skips to step 2**»; «settled during render on the `(open, record)` subject» → «on the `(open, record,
  initialValues)` subject»; § Files: `ExpenseDialog`'s `initialValues`.
- AGENTS.md § Assistant · Assistente, the proposal-protocol bullet (`:478` @ ce26af4d), rewritten in place (net 0
  lines): «- THE PROPOSAL PROTOCOL: the AI never writes — it emits fenced blocks that a card turns into a write on the
  user's Conferma: ONE ```goal-proposal (`POST`/`PATCH /api/goals`, `goalProposal.ts` the ONE schema, quotas by
  instrument NAME) and, in Registra (2026-11), up to five ```expense-proposal (`expenseProposal.ts`; the browser writes
  through `createExpenseSettledOnDate`, never a server route); a card's outcome is saved on its message
  (`proposals["kind:N"]`, N the block's rank among its language's blocks, derived from the markdown, never counted in
  render) through `PATCH …/messages/[messageId]`, so a reload never writes twice.» (AI-06 appends one clause.)
- CLAUDE.md § Key Features › Assistente AI: «… blocked in demo. doc/guide/assistente.md.» → «… blocked in demo;
  **Registra** (2026-11): a row described in words, proposed as a card and written by the browser on «Conferma», once.
  doc/guide/assistente.md.»; the implementing session's «Latest».
- `Draft Release Temp.md`, prepended under ✨ New Features: «- **Assistente — Registra** — Added a «Registra» mode to
  the Assistente (the pencil in its header): write what you spent or earned in your own words and the assistant, which
  knows your categories, accounts, cost centres, household, the last twelve months of rows and this month's budget,
  proposes up to five rows as cards — amount, category, date, account — that you confirm (the row is written as from
  the expense form, a future date moving the balance on its day), open in the expense form or ignore; a card, and a
  goal proposal too, remembers its outcome after a reload, «apri in Cashflow» opens Tracciamento on the row's month,
  and a message to the Assistente now stops at 4000 characters, with a counter from 3800.»

## 10. Declared out of scope

- Transfers (accounts and properties), loan instalments, recurring series, fees, payoff, new categories, the detail
  questions and «Rispondi», the categorisation rules in memory, the Cashflow bridge and the server/client split of
  `app/dashboard/cashflow/page.tsx` that passes `assistantConfigured` to it: **AI-06** (the prop goes in with its
  first reader; lint has 0 warnings today and an unread prop would be the first).
- Editing or deleting an existing row from the chat: never (decision 29).
- Attachments and voice input: never (decision 30).
- A server-side writer of rows: never (decision 17).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Assistant · Assistente, § Cashflow — expense mechanics, § React Query and Derived
State, § React Compiler and the hooks rules, § Accessibility, § Commands, § Dialog Form Reset, § Two-Step Create
Dialogs), DESIGN.md § 5 «AI Surfaces», doc/guide/assistente.md, doc/guide/cashflow.md,
doc/guide/cashflow-tracciamento.md, doc/guide/dialog.md, doc/guide/e2e-emulatori.md, doc/ai/README.md § 3-4-7,
doc/ai/AI-05-assistente-registra.md, le scene dell'Assistente in doc/ai/reference/concept-b.html e il diff di AI-03 (in develop). Node 24
(`node -v`). Implementa AI-05 così com'è scritta: la modalità `register` in OGNI punto del nuovo commento WARNING di
types/assistant.ts; lo zod sul body con tutti i campi e il tetto di 4000 caratteri in ogni modalità, il contatore da
3800; il contesto puro con gli id, la finestra italiana, le serie raccolte in una riga, il blocco IL MESE da
getDashboardOverview e dal livello puro del Budget; il blocco CASHFLOW 12 MESI anche in Registra (decisione 82); il protocollo ```expense-proposal SOLO nel prompt di Registra
(ASSISTANT_SYSTEM_CORE invariato, provato da asserzioni not.toContain e da expect(a.system).toBe(b.system)), al massimo
cinque card per messaggio con l'indice derivato da listFencedBlocks; la card con i servizi di oggi, il saving, le
quattro invalidazioni e il link a Cashflow con month=YYYY-MM; lo stato `proposals` sul messaggio con la route PATCH,
`done.messageId` adottato, l'esito scritto nel buffer e nella cache (anche la goal card); `initialValues` su
ExpenseDialog nel soggetto d'apertura con i quattro effetti corretti e il dialog caricato con lazyComponent; l'azione
nell'header, la striscia al posto della pill, «Torna all'analisi», `?mode=registra` e il thread del giorno
«Registrazioni · 1 nov 2026»; il verdetto e il pannello di Registra; tutta la pagina sotto AI Surfaces. I contratti
della § 4 sono condivisi con AI-06: nomi identici. Test dei componenti in .test.tsx con RTL, le funzioni pure in
.test.ts, Vitest in Europe/Rome, nella zona della macchina e con TZ=UTC; le due spec Playwright con lo stream SEMPRE
finto. Ti fermi e mi chiedi se: un tetto di perf:budget va alzato, il commento WARNING trova un punto che la spec non
nomina, o la colonna compagna non ha un contenitore unico da far scorrere (criterio 20). Collaudo: § 7; la prova
vera sul mirror al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Fable 5.1**, effort **xhigh**. Estimated size: one session, ~350 lines pure, ~250 server, ~550 client, ~700
tests, two E2E specs.
