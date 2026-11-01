# AI-05 — Assistente › Registra: the mode, the context, the proposal, the confirmation

> Series `doc/ai/` (README.md § 5): **depends on AI-03** (`ChoiceList`, the AI accent in CSS, DESIGN.md § 5 «AI
> Surfaces»); **AI-06 depends on it**. Written on 2026-11-01 from `develop` @ b9411a4d. Executes decisions 5, 9
> (the first two row kinds: expenses and income — transfers and instalments are AI-06), 11, 16, 17, 18 and the adopted
> choices A9–A14. The user's sentence that must work at the end of this spec: «Ciao, ho fatto spesa per 103 euro, per
> favore segnalo» → a card «Spesa · 103 € · Cibo › Spesa · oggi · Conto principale» → «Conferma» → the row in
> Cashflow › Tracciamento.

## 1. The problem today (evidence on the code)

- **Five modes, all analytical**: `AssistantMode = 'month_analysis' | 'year_analysis' | 'ytd_analysis' | 'history_analysis' | 'chat'`
  (`types/assistant.ts:9` @ b9411a4d), with a WARNING comment listing the eight places a new mode must touch; the
  only `Record<AssistantMode, …>` is `CURATED_FOLLOW_UPS` (`lib/utils/assistantFollowUps.ts:24`); the other sites
  branch with `if` and fall through to «chat» (`anthropicStream.ts:73-93`, `store.ts:37-43`, `assistantPeriodOptions.ts:74-166`,
  `AssistantThreadList.tsx:22`, `webSearchPolicy.ts:76-81`, `useAssistantPeriodContext.ts:192-220`,
  `app/api/ai/assistant/context/route.ts:44-99`, `AssistantPageClient.tsx:112,188-199,283-286`).
- **The route builds a bundle by mode** (`app/api/ai/assistant/stream/route.ts:213-245`): a mode with no branch gets
  `contextBundle = null`, `todayContext = null`, and `buildChatPrompt` prints «Non è stato selezionato un periodo…».
  The body is cast, not validated (`:162`). The rate limit is 30/h (`:165`).
- **The model writes nothing and knows no ids**: the categories block of the prompt prints names only
  (`prompts.ts:647-654`); the goal block prints `[id …]` (`:186`) and the goal-proposal protocol lives INSIDE
  `ASSISTANT_SYSTEM_CORE` (`:740-747`) — which the periodic emails share. No accounts with ids, no cost centres, no
  members, no recent rows reach the prompt in any mode.
- **The one write protocol is the goal card**: ```goal-proposal fenced block → `AssistantStreamingResponse.tsx:63-81`
  intercepts `pre` → `GoalProposalCard` (state in the component only, `useState<SubmitState>`, `:119`; buttons `h-9`
  = 36px, `:273,:290`; root `div.not-prose my-3 rounded-xl bg-muted/40 p-4`, `:179`) → `POST/PATCH /api/goals`. After a
  reload the card is «idle» again (the double-confirm blind spot, `doc/guide/assistente.md`, since 2026-09-19):
  the hook ignores `done.messageId` (`useAssistantStreaming.ts:320-331`), messages carry local ids until the thread
  refetches, and the message document has no field for a card's outcome (`store.ts:285-316`: `userId, role, content,
  mode, monthContext, webSearchUsed, createdAt`).
- **The write contract exists and is the browser's** (decision 17): `createExpenseSettledOnDate(userId, ExpenseFormData, categoryName, subCategoryName, now, fee?)`
  → `{ ids, parents, appliedEffects, appliedDebtRows }` (`lib/services/expenseService.ts:209`), then
  `applyDebtRepayments(appliedDebtRows)` (`debtRepaymentService.ts:50`) and `applyBalanceEffects(appliedEffects)`
  (`cashBalanceReconciliation.ts:74`), then the invalidations (`ExpenseDialog.tsx:2205-2220`: `assets.all`,
  `dashboard.overview`; the dialog's host invalidates `expenses.all`; the Compravendita adds `costCenters.all`).
  The service signs the amount from `type`; the caller passes the magnitude.
- **The dialog cannot be prefilled**: `ExpenseDialogProps` = `{ open, onClose, expense?, onSuccess?, returnFocusTo? }`
  (`:398-411`); the cost centre, the property and the member are plain `useState` initialised from `expense`
  (`:1514-1522, :1648-1650`); `defaultValues` come from `expense` or the blank form (`:1540-1560`).
- **The thread's messages reach the client through a route** (`GET /api/ai/assistant/threads/[threadId]`, mapped by
  `mapMessage`), not through Firestore rules: a new field on the message document is one mapper line away from the
  client.
- **Demo**: the page is gated client-side (`useDemoMode()`), the stream route is not demo-aware; the goal card
  disables «Conferma» in demo (`:276`).

## 2. Goal and acceptance criteria

A «Registra» mode in which the assistant knows the categories, the accounts, the centres and the members BY ID,
proposes a row as a card, and the browser writes it on «Conferma» through today's services — once.

1. **`AssistantMode` gains `'register'`** and every site of the WARNING comment branches on it explicitly (no
   fall-through to chat): `anthropicStream.buildPrompt` → `buildRegisterPrompt`; `store.getDefaultThreadTitle` →
   «Registrazioni»; `assistantFollowUps` → the `register` entry (two chips: «Registra una spesa di oggi», «Registra
   lo stipendio»); `webSearchPolicy` → never; `AssistantThreadList` → «Registra»; `assistantPeriodOptions`:
   `describePeriodHeader` → «Registra · senza periodo», `placeholder` → «Scrivi cosa hai speso o incassato…»,
   `emptyQuestion` → «Cosa vuoi registrare?», `findThreadForPeriod` → ignores `register` threads (A13);
   `useAssistantPeriodContext` → disabled; the context route → 400 «mode register has no context». Proof: a new
   `__tests__/assistantModeExhaustive.test.ts` imports every function and calls it with `'register'`, asserting none
   returns the chat's default string; `tsc` on the `Record`.
2. **The stream route validates the body with zod** (`assistantStreamRequestSchema` in `lib/utils/assistantStreamRequest.ts`,
   mode enum, `prompt` 1–4000 chars, `registerContext?` absent in v1) and, for `register`, builds
   `AssistantRegisterContext` (A14) and no bundle. Proof: `assistantStreamRoute.test.ts` (extend the existing route
   suite): a bad mode → 400; `register` → the register builder called once, the month builder never.
3. **`buildAssistantRegisterContext` is pure** (`lib/utils/assistantRegisterContext.ts`) and
   `formatRegisterContextForPrompt` prints: the categories by type with `[id]` and their subcategories with `[id]`;
   the liquid accounts `[id] name · balance · (addebito predefinito|accredito predefinito)`; the cost centres
   `[id] name` when `settings.costCentersEnabled` (else «Centri di costo: non attivi»); the members `[id] name` when
   `settings.expenseSplitEnabled` (else «Intestatari: non attivi»); the last `REGISTER_RECENT_ROWS_CAP = 300` rows of
   the last 12 months as `date · type · amount · category › sub · account · centre · member · note` with «e altre N
   non elencate»; today's Italian date. Proof: `assistantRegisterContext.test.ts` with invented data, both zones.
4. **The proposal protocol**: `lib/utils/expenseProposal.ts` → `EXPENSE_PROPOSAL_LANGUAGE = 'expense-proposal'`,
   `expenseProposalSchema` (v1: `kind: 'expense' | 'income'`, `type: 'fixed' | 'variable' | 'income'`, `amount` > 0
   ≤ 1 000 000, `dateIso`, `categoryId`, `subCategoryId?`, `accountId?`, `costCenterId?`, `memberId?`,
   `excludeFromBudget?`, `note?` ≤ 200, `reason` ≤ 240 — why this category), `parseExpenseProposal(raw)`,
   `proposalKey(kind, index)`; the system prompt's **REGISTER_CONTRACT** (in `buildRegisterPrompt`'s `system`, NOT
   in `ASSISTANT_SYSTEM_CORE`) teaches it: one block per row the user named, ids copied from the blocks, the category
   chosen from the recent rows' pattern and the `reason` saying which rows, the account = the default for the type
   unless the user named one, the date = today unless said, never a block without an amount, never a question in
   v1 (AI-06 adds them) — when something is missing, ask in prose. Proof: `expenseProposal.test.ts` (schema bounds, a
   `type` that disagrees with `kind` rejected) and `assistantPrompts.test.ts` (the contract present in `register`,
   ABSENT from the other modes' `system` and from the email prompt: snapshot of `ASSISTANT_SYSTEM_CORE` unchanged).
5. **`ExpenseProposalCard`** renders per The Question-Card/AI-Accent Rules: a `bg-muted` sub-tile (DESIGN →
   Conversation-Is-Content) with the AI-accent border and the eyebrow «L'Assistente propone», the row as the
   Tracciamento feed prints it (`formatCurrency`, sign colour by type, category › sub, date `DD/MM/YYYY`, account,
   centre, member, «Fuori dal budget» when set), the `reason` 13px muted, three 44px buttons «Conferma» (primary),
   «Modifica» (outline → `ExpenseDialog` with `initialValues`), «Ignora». A proposal naming an id the context does
   not have (a deleted category) renders the card with «categoria non trovata: apri Modifica» and «Conferma»
   disabled. Proof: RTL `expenseProposalCard.test.tsx`; the E2E below.
6. **«Conferma» writes through the services** (A10): `createExpenseSettledOnDate(ownerId, toExpenseFormData(proposal), category.name, sub?.name, new Date())`
   → `applyDebtRepayments` → `applyBalanceEffects` → invalidate `expenses.all`, `assets.all`, `dashboard.overview`,
   `costCenters.all`; the toast of the dialog's wording («Spesa registrata»); the card turns «Registrata · apri in
   Cashflow» with a link to `/dashboard/cashflow?tab=tracking&month=YYYY-MM` (the deep link the Panoramica uses —
   verify the param name in `panoramica.md` § category deep link). In demo «Conferma» is disabled with the demo
   aria-label. Proof: E2E on the emulators with a FAKED stream (`page.route('/api/ai/assistant/stream', …)` emitting
   `meta`, `text` with the fenced block, `done` with a messageId) → click → the row exists in the emulator's
   `expenses` (Admin read in the spec) with the right sign, category, `linkedCashAssetId`, and the cash asset's
   balance moved.
7. **One confirmation, persisted** (decision 18, A11): `AssistantMessage.proposals?: Record<string, AssistantProposalState>`
   with `AssistantProposalState = { status: 'written' | 'ignored'; writtenIds?: string[]; at: Date }`, keyed by
   `proposalKey('expense' | 'goal', index)` (the index of the block in the message); written by
   `PATCH /api/ai/assistant/threads/[threadId]/messages/[messageId]` (body `{ userId, key, state }`, owner-scoped
   through `assertCanAccessAccount`, `setAssistantMessageProposal` in `store.ts` with `merge`); returned by the GET
   through `mapMessage`. Both cards read their state from the message and render «Registrata»/«Creato»/«Ignorata»
   without buttons; the streaming message learns its id from `done.messageId` (the hook adopts it: the local id is
   replaced, `MessageIdProvider` wraps each `ReactMarkdown` so a card inside knows `threadId` + `messageId` + its
   block index — a counter in the `pre` interceptor, reset per message). Proof: E2E confirms, reloads, the card
   shows «Registrata» and has no «Conferma»; the goal card's E2E (if any) or a new one does the same; the routes
   test for the PATCH (403 for another user, 400 for a bad key).
8. **The header action and the hidden pill** (decision 16): `AssistantHeader` gains an icon action «Registra»
   (`PencilLine`, aria-label «Registra una spesa o un'entrata», disabled in demo), which calls
   `onEnterRegister` → `setMode('register')`, opens or creates the «Registrazioni» thread of the day (one thread per
   Italian day: `findRegisterThread(threads, todayIso)` by `mode === 'register' && createdAt` in the day; else a new
   one) and focuses the composer; in `register` mode `AssistantPeriodSelector` is not rendered and in its place a
   one-line `TILE_SUB_EYEBROW_CLASS` strip says «Registra · l'Assistente conosce categorie, conti e le ultime righe»
   with a link-button «Torna all'analisi» (→ `setMode('month_analysis')`). The `?mode=registra` query param on
   `/dashboard/assistant` enters the mode on mount (the Cashflow bridge of AI-06 points here; the param is parsed
   now so AI-06 only adds the button). Proof: E2E clicks the header action, sees the strip, no pill; a visit with
   `?mode=registra` lands in the mode.
9. **`ExpenseDialog` accepts `initialValues?: ExpenseDialogInitialValues`** (`Partial<ExpenseFormData> & { costCenterId?, personalMemberId?, propertyAssetId? }`),
   used ONLY when `expense` is absent: the form's `defaultValues`/`reset` and the three `useState`s take them; step
   starts at 2 when `initialValues.categoryId` is set. Proof: RTL test on the dialog (the existing dialog suite if
   one exists, else a focused one) and the E2E «Modifica» path: the dialog opens with 103 and the category; saving
   from it marks the card «Registrata» through `onSuccess(saved)` → the PATCH with `writtenIds: [saved.id]`.
10. **The context panel** (the `[1fr]` column) in `register` mode shows the register context's summary instead of
    the period tiles: the accounts with balances and the two defaults, the count of categories, «ultime N righe
    lette» — from a `context`-like SSE event? No: the stream's `context` event carries a bundle; `register` emits a
    new `{ type: 'register', summary: AssistantRegisterSummary }` (accounts, counts) that the hook stores and the
    panel renders. Proof: the hook test; the E2E sees the accounts in the panel.
11. **Memory extraction runs in `register` too** (today it runs for every mode) with ONE added sentence to the
    extractor's system prompt: «una regola di categorizzazione detta dall'utente (“la palestra è Salute”) è una
    `preference`» (A18 belongs to AI-06; the sentence is harmless here and lets AI-06 test against it). Proof:
    `memoryExtraction.test.ts` snapshot.
12. **Nothing else changes for the other modes**: the email prompt's `system`, `buildChatPrompt`'s output, the
    goal card's behaviour except the persisted state. Proof: the existing suites' snapshots.

## 3. Decisions

- **Decisions 5, 9 (expenses + income here), 11, 16, 17, 18 (owner)**; **A9–A14 (adopted, reversible)**.
- **Adopted, reversible**: the model is Sonnet 5.5 at effort `high` (the Assistente's), `ASSISTANT_REGISTER_MAX_TOKENS = 16000`
  (a proposal is short; 64000 would let thinking run long), no web search ever, history cap as chat (20 messages).
- **Adopted, reversible**: `type` for an expense is chosen by the model between `fixed` («Spese Necessarie») and
  `variable` («Spese Non Necessarie») from the category's type when the category is bound to one (`ExpenseCategory.type`
  — verify the field; the Compravendita's `CategoryField` filters «by allowed type»), else from the recent rows; the
  card validates `kind`/`type`/category agreement and shows the mismatch instead of writing.
- **Adopted, reversible**: the amount in the proposal is a magnitude in euro with two decimals; the card passes it as
  `amount` and the service signs it; `currency: 'EUR'` always in v1.
- **Adopted, reversible**: the date defaults to the Italian today (`getItalyDateIso`); «ieri», «lunedì» are the
  model's to resolve from the printed today; the card shows the resolved date and «Modifica» fixes a wrong one.
- **Adopted, reversible**: one «Registrazioni» thread per Italian day (A13 refined): the title «Registrazioni · 1
  nov 2026»; the thread list shows them under the «Registra» label.
- **Adopted, reversible**: a card's state is keyed by block index within the message; a message re-rendered from the
  store keeps the same order (the text is the same), so the key is stable.
- **Adopted, reversible**: the goal card migrates to the persisted state in THIS spec (decision 18 says one
  mechanism); its 36px buttons become 44px (`h-11 desktop:h-9`) at the same time — the ONLY visual change to it.

## 4. Solution

### Types (`types/assistant.ts`)

```ts
export type AssistantMode = 'month_analysis' | 'year_analysis' | 'ytd_analysis' | 'history_analysis' | 'chat' | 'register';
export interface AssistantProposalState { status: 'written' | 'ignored'; writtenIds?: string[]; at: Date }
export interface AssistantMessage { …; proposals?: Record<string, AssistantProposalState> }
export interface AssistantRegisterSummary { accounts: { id: string; name: string; balance: number; roles: ('addebito' | 'accredito')[] }[]; categories: number; recentRows: number; recentRowsCut: number; costCentersEnabled: boolean; membersEnabled: boolean }
export type AssistantStreamEvent = … | { type: 'register'; summary: AssistantRegisterSummary };
export interface AssistantStreamRequest { …; mode: AssistantMode /* 'register' needs no month/year */ }
```

### `lib/utils/assistantRegisterContext.ts` (pure, shared with AI-06)

```ts
export const REGISTER_RECENT_ROWS_CAP = 300;
export const REGISTER_RECENT_MONTHS = 12;
export interface AssistantRegisterContextInput { todayIso: string; categories: ExpenseCategory[]; assets: Asset[]; settings: AssetAllocationSettings | null; costCenters: CostCenter[]; recentExpenses: Expense[] /* already windowed, any order */ }
export interface AssistantRegisterContext { todayIso: string; categories: …; accounts: …; defaults: { debitId: string | null; creditId: string | null }; costCenters: { enabled: boolean; items: { id: string; name: string }[] }; members: { enabled: boolean; items: { id: string; name: string }[] }; recent: { rows: RegisterRecentRow[]; cut: number } }
export function buildAssistantRegisterContext(input: AssistantRegisterContextInput): AssistantRegisterContext; // sorts recent by date desc, cuts at the cap, declares the cut
export function formatRegisterContextForPrompt(ctx: AssistantRegisterContext): string;
export function summarizeRegisterContext(ctx: AssistantRegisterContext): AssistantRegisterSummary;
```

### `lib/utils/expenseProposal.ts` (pure, shared with AI-06)

```ts
export const EXPENSE_PROPOSAL_LANGUAGE = 'expense-proposal';
export const expenseProposalSchema = z.object({
  kind: z.enum(['expense', 'income']),
  type: z.enum(['fixed', 'variable', 'income']),
  amount: z.number().positive().max(1_000_000),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().min(1), subCategoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(), costCenterId: z.string().min(1).optional(), memberId: z.string().min(1).optional(),
  excludeFromBudget: z.boolean().optional(), note: z.string().max(200).optional(), reason: z.string().min(1).max(240),
}).refine((p) => (p.kind === 'income') === (p.type === 'income'), { message: 'kind/type disagree' });
export type ExpenseProposal = z.infer<typeof expenseProposalSchema>;
export function parseExpenseProposal(raw: string): ExpenseProposal | null;
export function proposalKey(kind: 'expense' | 'goal', index: number): string; // 'expense:0'
/** The proposal resolved against the context the page holds: names for the card, the form data for the service, or the reasons it cannot be written. */
export function resolveExpenseProposal(p: ExpenseProposal, refs: { categories: ExpenseCategory[]; cashAssets: Asset[]; costCenters: CostCenter[]; members: FamilyMember[]; defaults: { debitId; creditId } }): { ok: true; formData: ExpenseFormData; categoryName: string; subCategoryName?: string; labels: {...} } | { ok: false; problems: string[] };
```

`resolveExpenseProposal` picks `linkedCashAssetId = p.accountId ?? (kind === 'income' ? defaults.creditId : defaults.debitId) ?? undefined`,
`date` built from `dateIso` exactly as `ExpenseDialog` builds it from its date field (read its `onSubmit` at
implementation and call the same helper — the dialog does not use `fromZonedTime`; whatever it does is THE rule,
because the row must sort and settle like a row typed by hand), `costCenterName` from the centre,
`excludeFromBudget`, `personalMemberId`.

### Server

- `lib/server/assistant/prompts.ts`: `REGISTER_CONTRACT` (criterion 4; «In questa modalità non proporre obiettivi»),
  `buildRegisterPrompt(prompt, preferences, memoryItems, registerBlock)` → `{ system: ASSISTANT_SYSTEM_CORE + REGISTER_CONTRACT, userContent }`
  (memory block, the register block, «Richiesta utente: …»).
- `anthropicStream.ts`: `buildPrompt` takes `registerBlock`; `register` uses `ASSISTANT_REGISTER_MAX_TOKENS`, no
  tools; `isStructured` arrays untouched (register is not structured).
- `stream/route.ts`: zod on the body; `register` → `fetchRegisterInputs(userId, now)` (Admin: categories, assets,
  settings, cost centres, the 12-month expenses — the sibling of AI-02's fetch, in `assistantMonthContextService.ts`)
  → `buildAssistantRegisterContext` → emit `{ type: 'register', summary }` before the text; `webSearch` false.
- `store.ts`: `setAssistantMessageProposal(threadId, messageId, userId, key, state)`; `mapMessage` maps `proposals`
  (dates via `toDate`); `getDefaultThreadTitle('register')`.
- `app/api/ai/assistant/threads/[threadId]/messages/[messageId]/route.ts`: `PATCH` with `parseOr400(proposalPatchSchema)`,
  `assertCanAccessAccount`, the thread's `userId` must equal the body's.
- `memoryExtraction.ts`: the one sentence.

### Client

- `useAssistantStreaming.ts`: adopt `done.messageId` (replace the local id in `streamingMessages`); store the
  `register` summary (`registerSummary` state, cleared on thread change); the `pre` counter per message.
- `components/assistant/MessageIdContext.tsx`: `MessageIdProvider({ threadId, messageId, proposals, children })`,
  `useMessageId()` → `{ threadId, messageId, proposals, nextIndex() }`; `AssistantStreamingResponse` wraps each
  message's `ReactMarkdown` and the `pre` interceptor reads `nextIndex()` for both languages.
- `components/assistant/ExpenseProposalCard.tsx` (criterion 5–7): props `{ proposal, index }`; reads the refs from
  the hooks the page already has (`useExpenseCategories`, `useAssets`, `useCostCenters`, settings) — the page passes
  them through a small `RegisterRefsContext` to avoid prop drilling through markdown; `useMutation` for the write with
  the four invalidations; the PATCH after the write (fire-and-await; a failed PATCH shows the toast «Registrata, ma
  la card potrebbe ricomparire» — never blocks the write's success).
- `GoalProposalCard.tsx`: reads/writes the persisted state through the same context; buttons 44px.
- `AssistantHeader.tsx`: the «Registra» action; `AssistantPageClient.tsx`: `mode === 'register'` → the strip instead
  of the pill, the `?mode=registra` param on mount (`useSearchParams`), the thread-of-the-day logic, the panel's
  register summary; `AssistantThreadList.tsx`: the label.
- `ExpenseDialog.tsx`: `initialValues` (criterion 9).
- `lib/utils/assistantNarrative.ts`: `describeConversation` gains `mode` → for `register`: «N messaggi; le righe
  proposte si scrivono solo su Conferma.»

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **`ASSISTANT_SYSTEM_CORE` is shared with the emails** — here it means the REGISTER_CONTRACT is appended in
  `buildRegisterPrompt` only; the snapshot of the core is the gate; «in questa modalità non proporre obiettivi»
  neutralises the core's goal protocol for this mode.
- **`system` byte-identical per mode** — the register block (ids, rows) is `userContent`.
- **The silent-cap rule** — «e altre N non elencate» for the rows; the 300 cap is in the text.
- **Hooks, not services, in components** (AGENTS.md) — here it means the card calls the services inside a
  `useMutation` (as `ExpenseDialog` does), never in an event handler without the mutation.
- **Query keys and invalidations** — the four keys of A10; `expenses.all(ownerId)` is the prefix the Tracciamento's
  windowed queries live under (`['expenses', uid, …]`), so one prefix invalidation reaches them.
- **The window-read rule** — the recent rows are 12 months by date, read once per request, Admin.
- **Demo** — `useDemoMode()` disables «Conferma»/«Modifica» and the header action; the stream route stays
  demo-unaware (it writes nothing); the PATCH route is owner-scoped like the others.
- **The sign rule** — the card passes magnitudes; the service signs by `type`; the fixture's assertion reads the
  stored sign.
- **A `ResponsiveModal` opener that never held focus** — here it means «Modifica» passes `returnFocusTo` = the card's
  «Modifica» button ref.
- **React Compiler** — the card and the context are compiled; no logic inside `try` in the mutation map.
- **a11y: one live region** — the card's state change is announced by the page's existing status line (the
  composer's), not by a new `aria-live`.
- **Italian `Intl` in E2E** — assert amounts with the harness's `formatCurrency` helper, never a literal `103,00 €`.
- **No owner data** — the E2E seed's categories («Cibo › Spesa», «Casa › Affitto»), accounts («Conto principale»),
  the amount 103.45, the decoy row «ornitorinco».
- **WORKFLOW rule 4** — `doc/guide/assistente.md` is Italian today: new sections in English, the rest untouched.

## 6. Tests per level (with the mutation that proves each)

- `assistantModeExhaustive.test.ts` (new): criterion 1. Mutation: remove the `register` branch of
  `getDefaultThreadTitle` → «Nuova conversazione» → fails.
- `assistantRegisterContext.test.ts` (new): the block's lines, the cut, the defaults' roles, «non attivi» lines,
  both zones (a row at Italian midnight on the window's edge). Mutation: sort asc → the cut drops the newest rows.
- `expenseProposal.test.ts` (new): bounds; kind/type refine; `resolveExpenseProposal` default account by kind, the
  unknown category problem, the noon date. Mutation: default debit for income → fails.
- `assistantPrompts.test.ts`: `buildRegisterPrompt` snapshot; `ASSISTANT_SYSTEM_CORE` snapshot unchanged; the
  email builder's `system` unchanged. Mutation: add the contract to the core → two snapshots fail.
- `assistantStreamRoute.test.ts`: zod 400; the register builder path; the `register` SSE event before `text`.
- `assistantStore.test.ts` (or the existing store suite): `setAssistantMessageProposal` merge; `mapMessage` dates.
- `assistantMessageRoute.test.ts` (new): PATCH 200/400/403.
- `useAssistantStreaming.test.ts`: `done.messageId` replaces the local id. Mutation: keep ignoring it → fails.
- `expenseProposalCard.test.tsx`, `goalProposalCard.test.tsx` (RTL): the three buttons 44px on a phone viewport
  (class assertion), the persisted state renders without buttons, the unknown-category state.
- `expenseDialog.initialValues.test.tsx` (RTL): the prefill.
- `reactCompilerCoverage`: the new components.
- **E2E** `e2e/assistant.register.spec.ts` (desktop) + `.mobile`: the faked stream (one `text` event carrying the
  fenced block with the seed's ids, `done` with a messageId the spec writes to the emulator first through the Admin
  SDK: the thread + the assistant message, so the PATCH has a document), «Conferma» → the Admin read of `expenses`
  (sign, category, account, `balancePending` false for a past date) and of the cash asset's balance; reload → the
  card shows «Registrata»; «Modifica» → the dialog prefilled; «Ignora» → persisted «Ignorata»; `?mode=registra` →
  the strip; the decoy «ornitorinco» untouched.

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the twelve criteria; the outcome «“ho fatto spesa per 103 euro” becomes a card; Conferma writes one row
  through the services; a reload cannot write it twice».
- **B**: the REGISTER_CONTRACT read with the owner (the product's voice); the card's copy.
- **C**: `tsc`, lint, both-zone Vitest (the thirteen suites), the two E2E specs, `perf:budget` (the assistant chunk
  grows by the card and the dialog import — the dialog is lazy today? check `lazy-component.tsx` usage; keep it lazy).
- **D**: the emulator's `expenses` and `assets` documents read by the spec; the message document's `proposals`.
- **E**: screenshots at 390/1280 of the card (idle, written, unknown-category), the strip, the panel.
- **F**: the owner, on the preview with the owner's key, types the sentence of § 0 and two more («stipendio di
  2.000 ieri», «benzina 60 euro fuori budget» — the second asks for AI-06's details, in prose here); confirms the
  first; opens Tracciamento and sees it; reloads the thread. The owner's wording for the card.
- **G**: the Admin seed scripts and screenshots removed; the owner deletes the three test rows from Tracciamento
  (or the spec's cleanup if the preview pointed at the emulators — it does not: production rows are the owner's to
  delete); `SESSION_NOTES.md` not committed.

## 8. Putting it into service

Branch `feat/assistente-registra`, commit `feat(assistente): Registra — a mode that proposes a row and writes it on
Conferma, once`, PR to `develop`, the preview for phase F. Flag: the Assistente's `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`
already gates the page; no new flag.

## 9. Documentation

- `doc/guide/assistente.md`: § «Registra» (the mode, the context block and its ids, the protocol, the card, the
  write path, the persisted proposals, the header action, the strip, the thread of the day); § Files; § Per-page
  blind spots: «a proposal is never written by the server», «a card without a messageId (a very old message)
  renders without the buttons», the goal card's blind spot of 2026-09-19 CLOSED (rewrite that bullet). English.
- `doc/guide/cashflow-tracciamento.md` § Per-page blind spots: «a row from the Assistente carries no mark: it is a
  row like any other» (and the deep link the card uses).
- `doc/guide/dialog.md`: `ExpenseDialog.initialValues`.
- AGENTS.md § Assistente stub: «Registra writes through the client services, once, the state on the message
  (2026-11)»; the query-keys line if `assistant.thread` invalidation changes.
- CLAUDE.md § Key Features › Assistente AI: «+ Registra (2026-11): a row proposed as a card, written on Conferma»;
  § Key Files: `expenseProposal.ts`, `assistantRegisterContext.ts`.
- `Draft Release Temp.md`: «Scrivi all'Assistente “ho speso 103 euro di spesa”: ti propone la riga, tu confermi».

## 10. Declared out of scope

- Transfers, instalments, recurring series, the detail questions, the memory rules, the Cashflow bridge button:
  **AI-06**.
- The portfolio/period context in `register` mode: heir CLAUDE.md § Not yet present («Registra does not read the
  period bundle»).
- A server-side writer (an API that writes rows): never (decision 17).
- Editing or deleting an existing row from the chat: heir CLAUDE.md § Not yet present («Registra creates, never
  edits»).
- Attachments (a receipt photo): heir CLAUDE.md § Not yet present.

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Assistente, § Cashflow, § Query keys, § React Compiler, § a11y, § Commands),
DESIGN.md § 5 «AI Surfaces» e «Muted Sub-tile», doc/guide/assistente.md, doc/guide/cashflow.md,
doc/guide/cashflow-tracciamento.md, doc/guide/dialog.md, doc/guide/e2e-emulatori.md, doc/ai/README.md § 3-4-7,
doc/ai/AI-05-assistente-registra.md e il diff di AI-03 (in develop). Implementa AI-05 così com'è scritta: la
modalità `register` in OGNI punto del commento WARNING di types/assistant.ts, lo zod sul body, il contesto puro e il
suo blocco con gli id, il protocollo ```expense-proposal nel SOLO prompt di Registra (ASSISTANT_SYSTEM_CORE
invariato, snapshot), la card con i servizi di oggi e le quattro invalidazioni, lo stato `proposals` sul messaggio
con la route PATCH e `done.messageId` adottato (la goal card migra), `initialValues` su ExpenseDialog, l'azione
nell'header e la pill nascosta, `?mode=registra`. I contratti della § 4 sono condivisi con AI-06: nomi identici.
Vitest in entrambe le zone, le spec Playwright con lo stream SEMPRE finto. Collaudo: § 7; la prova vera sul
preview al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non
si committa.
```

Model: **Fable 5.1**, effort **xhigh**. Estimated size: 1 long session (~7 h) or two sessions split at criterion 7
(the persisted state) if the first runs long — the split point is declared here so the first commit is whole
(criteria 1–6, 8–12 with the card's state in-memory; the second commit 7 alone). ~250 lines pure, ~200 server,
~400 client, ~450 tests, two E2E specs.
