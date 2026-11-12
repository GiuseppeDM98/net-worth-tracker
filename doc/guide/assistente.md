# Assistente AI

> **When to open this guide** — whoever touches `app/dashboard/assistant/*`, `components/assistant/*`,
> `lib/server/assistant/*`, `lib/services/assistantMonthContextService.ts`,
> `lib/utils/{assistantNarrative,assistantPeriodOptions,assistantQuestionBlocks,assistantRegisterContext,assistantStreamBuffer,cashflowBlock,expenseBreakdown,expenseProposal,goalProposal}.ts`,
> `lib/hooks/useAssistantStreaming.ts`, `app/api/ai/assistant/*`, `app/api/goals/route.ts`. In
> `AGENTS.md` the stub with the essentials stays; here is the full rule. Modules and files: § *Files* below.
> E2E: `e2e/assistant.register.spec.ts`, `e2e/assistant.register.mobile.spec.ts`, `e2e/assistant.register.{kinds,question}.spec.ts`
> and `e2e/assistant.register.question.mobile.spec.ts` (Registra, the stream always
> faked with `page.route`, helper `e2e/assistantRegister.ts`); the analysis modes have no Playwright spec.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Assistant**: `app/dashboard/assistant/page.tsx`, `components/assistant/AssistantPageClient.tsx` + `tiles/*`, pure `lib/utils/{assistantNarrative,assistantPeriodOptions}.ts`; `app/api/ai/assistant/*`, `lib/server/assistant/*` (`goalEvaluation.ts` pure, `goalEvaluationService.ts` I/O, `memoryExtraction.ts`, `store.ts` → `mergeMemoryItem`), `components/assistant/AssistantModals.tsx` (Conversazioni · Memoria), `lib/hooks/useAssistantStreaming.ts`, `lib/services/assistantMonthContextService.ts` over `lib/utils/expenseBreakdown.ts` (`buildCashflowBreakdown`) and `lib/utils/cashflowBlock.ts` (the CASHFLOW 12 MESI block, its rules in doc/guide/consulente.md § The run); goals `lib/server/goalData.ts`, `lib/utils/goalProposal.ts` (ONE zod schema), `app/api/goals/route.ts`, `components/assistant/GoalProposalCard.tsx`
- **The portfolio block** (2026-10-20): pure `lib/utils/assistantPortfolioContext.ts` (`buildAssistantPortfolioContext`, `emptyAssistantPortfolioContext` for the fixtures), printed by `formatPortfolioForPrompt` in `prompts.ts`; the Italian month bounds `getItalyMonthBoundsUtc`/`getItalyMonthRangeBoundsUtc` in `lib/utils/dateHelpers.ts`. The Consulente of Allocazione is its own guide: doc/guide/consulente.md.
- **Registra** (2026-11): pure `lib/utils/{expenseProposal,assistantRegisterContext,assistantStreamBuffer,assistantQuestionBlocks}.ts` (the question helpers in `lib/utils/questionSet.ts`), `components/assistant/{ExpenseProposalCard,MessageIdContext,RegisterRefsContext,AssistantQuestionBlock,MessageQuestionsContext}.tsx`, `components/assistant/tiles/RegistraContestoTile.tsx`, `app/api/ai/assistant/threads/[threadId]/messages/[messageId]/route.ts` (the PATCH of a card's outcome), `fetchRegisterInputs` in `assistantMonthContextService.ts`, `ExpenseDialog`'s `initialValues` (doc/guide/dialog.md), `parseCashflowMonthParam` in `lib/utils/period.ts`. Suites: `expenseProposal`, `assistantRegisterContext`, `assistantStreamBuffer`, `assistantQuestionBlocks`, `questionSet`, `assistantQuestionBlock` (`.test.tsx`), `assistantFollowUps`, `assistantMessageRoute`, `expenseProposalCard`, `goalProposalCard`, `assistantStreamingResponse`, `assistantComposer`, `useAssistantStreaming`, `expenseDialogInitialValues`, `assistantCompanionScene`, `assistantHeader` (the last eight `.test.tsx`), and the five E2E specs with the emulators up.
- **Suites to run after a change here — Assistant** (moved from `AGENTS.md` § Commands on 2026-09-30): `assistantRoutes`, `assistantThreadsStore` (the pages and the cursor), `assistantWebSearchPolicy`, `assistantMonthContextService`, `assistantPortfolioContext`, `assistantPromptBundle`, `dateHelpers`, `cashflowBlock`, `anthropicStream` · **Verdetto e letture** `assistantNarrative` (+ `overviewNarrative` for the no-context verdict) · **Obiettivi** `assistantGoalEvaluation`, `assistantGoalEvaluationService`, `assistantMemoryExtraction`, `assistantMemoryStore` · **Goal-Based** `goalMath`, `goalProposal`, `apiAuthRoutes` · **Email** `monthlyEmailService` (the same block)

## Assistant

### Context service (`lib/services/assistantMonthContextService.ts`)
- Runs server-side — `adminDb` directly, never the client SDK. `selector.month`: `>0` monthly, `0` year, `-1` YTD, `-2`
  history.
- **Every mode must map to its own builder in `stream/route.ts`** — a mode with a prompt builder but no branch silently
  falls through to the monthly builder and is answered on one month of data.
- **`buildAssistantPeriodRangeContext` is the FIFTH builder** (any run of months inside one year: quarters, semesters,
  every periodic email). The `{year, month}` selector cannot encode a range, so its `selector` is the window's CLOSING
  month and the window travels as the first `dataQuality.notes` entry plus `formatBundleForPrompt`'s `periodLabel` —
  never as a new bundle field, which all four other builders would then have to fill.
- **One aggregator per block, not two**: every figure of the BUNDLE comes from a single `buildCashflowBreakdown` call
  per builder, so `Σ expensesByCategory[].total === cashflow.totalExpenses` holds structurally. `transactionCount`
  **excludes transfers**, and a new required bundle field means updating ALL 5 builders (month/year/ytd/history/period range). The
  CASHFLOW 12 MESI block every prompt carries beside the bundle (2026-11, every mode since 2026-11-07) is built by
  `buildCashflowBlock` on its own read of the whole history (`fetchCashflowBlockInputs`) and never enters the bundle
  nor the `context` SSE event.
- **Removing an `AssistantMode` ripples past the WARNING checklist in `types/assistant.ts`**: grep `Record<AssistantMode,
  …>` too (`assistantFollowUps.ts`'s `CURATED_FOLLOW_UPS` is the live site).

### Prompt builders (`lib/server/assistant/prompts.ts`)
- `system` is byte-identical across users and requests of that mode — **never interpolate per-request data into it**;
  mode-specific conditionals stay generic and the concrete note lives in `userContent`.
- **`cache_control` is deliberately NOT used** here: cache writes cost 1.25× and only pay off within the 5-minute TTL,
  against sporadic single-user traffic.
- Always include `--- ALLOCAZIONE CORRENTE ---` before the movers section, or Claude hallucinates "unclassified" gaps.
  `formatBundleForPrompt` destructures named fields only — a new bundle field is silently missing unless added, and
  `--- CATEGORIE DI SPESA CONFIGURATE ---` is not redundant: it lists what *exists*, unused categories included.
- **A silent cap in a context builder becomes a hallucinated "N/D"** — an LLM cannot distinguish *absent from the data I
  was sent* from *absent from the world*, and the data-integrity rules then forbid speculation. **Rule: a cap either does
  not exist, or is stated in the text the model reads.** Once a block is exhaustive the system prompt must say so, and
  must tell the model that a missing item means *no spending recorded*, not *no data*. `buildEmailAiPrompt` reuses
  `ASSISTANT_SYSTEM_CORE`: extend the shared core, do not duplicate the guardrail text.
- **`ASSISTANT_SYSTEM_CORE` is shared with `buildEmailAiPrompt`**, so its phrasing about the goals block stays
  conditional: **check every consumer before extending the core unconditionally**, or a surface starts talking about
  data it was never given.
- **Every builder takes the CASHFLOW 12 MESI block** (2026-11; every surface since 2026-11-07): the
  four analyses as their fifth argument, printed after the numeric block and before «Domanda dell'utente»; the chat
  as its seventh, right before «Richiesta utente» with or without a period; `buildEmailAiPrompt` as its sixth, at
  the end of the user turn; `generateWeeklyBudgetComment` as its second, under the budgets; `buildRegisterPrompt` as its fifth
  (`string | null`), after the register block and right before «Richiesta utente»; the Consulente's
  strategy after its data block (doc/guide/consulente.md § The run). ONE note over it everywhere
  (`formatCashflowBlockSection`): the block is the whole recorded history whatever the period, a
  period's figures stay its bundle's. `system` is the same with or without it. The route, the periodic comment and
  the weekly one read it through `readCashflowBlockForPrompt` (lib/server/assistant/cashflowBlockPrompt.ts): a
  failed read answers 500 on the stream and sends an email without its AI comment — never a silent empty block.
  The weekly email with no API key reads no block (2026-11-07): there is no comment for it to serve.

### The portfolio block — the assistant sees everything (2026-10-20)
- **`bundle.portfolio` is REQUIRED and built by ONE pure function**, `buildAssistantPortfolioContext`
  (`lib/utils/assistantPortfolioContext.ts`), from the documents every builder fetches beside the assets
  (`fetchPortfolioDocuments`: `assetTransactions`, `dividends`, `pensionContributions`) and the period's expenses:
  every held instrument with class, sub-category, ROLE, quantity, value, fiscal PMC and G/P in euro, owner
  (`describeAssetOwnerLabel`), liquidity; the allocation on the Allocazione page's base; the ledger; the dividend
  registry in its two halves and the coupon of every bond held; the pension funds with their contributions by tax
  year and nature; the loans; the household (`familyMembers`, `userAge`). `formatPortfolioForPrompt` prints every
  list whole or declares the cut (`PORTFOLIO_LEDGER_ROW_CAP` 300, `PORTFOLIO_DIVIDEND_ROW_CAP` 150, the oldest rows
  dropped, the omission written) — the silent-cap rule above. The owner's account measured ~3700 tokens.
- **A free question with NO context still gets the portfolio of today** (owner's run, 2026-10-20: with «Nessuno» the
  assistant answered «non c'è il blocco STRUMENTI» to «quali strumenti ho liberi da obiettivi?», because the route built
  a bundle only for a chosen period). `buildAssistantTodayContext(userId)` returns `AssistantTodayContext` — the
  bundle's `portfolio`, `goals`, `targetAllocation`, `targetAllocationSource`, from the same documents and the
  same pure functions as the five period builders (no expenses: the loans' «ultima rata nel periodo» needs a period;
  no snapshot, no cashflow). `formatTodayContextForPrompt` prints it under «=== DATI FINANZIARI: PORTAFOGLIO DI OGGI
  (nessun periodo selezionato) ===» with a line naming what is NOT there (income, outflows, snapshot, comparison between
  dates: «chiedi all'utente di selezionare il periodo, non stimare»); `buildChatPrompt` takes it as its sixth argument
  and uses it only when there is no bundle. The route passes it as `todayContext` to `streamAssistantResponse` and
  sends NO `context` SSE event: the page's tiles are a period's, and «Patrimonio oggi» already stands in.
- **The allocation the model reads is the PAGE's base, never the snapshot's whole patrimony** (owner's decision):
  `partitionByAllocationRole` + `buildHoldings` with the debts (`includeDebts`), tradable + frozen as the base,
  the excluded group listed apart, the fixed cash amount carved out before the other targets apply
  (`toLegacyAllocationResult`'s reading, rebuilt in `buildTargetRows`). Until then the prompt stood the manual
  targets against `currentSnapshot.byAssetClass` — the home, the mortgage and the pension funds included — and
  the model saw «Immobili 22%» on a page that shows no real estate. The snapshot's block stays, renamed
  «PATRIMONIO PER CLASSE A FINE PERIODO», and the system core tells the model which is which; the old
  «ALLOCAZIONE TARGET vs CORRENTE» block on the snapshot is gone.
- **A goal carries its instruments** (`goals.items[].assignments`: name, ticker, the quota as written — «50%»,
  «273 quote» through `formatOwnerSlice` — and its euro today) **and its id** (`[id …]` on the goal's line: the handle a
  ```goal-proposal block names to MODIFY it). **Every holding says what the goals hold of it** (owner, same day: «vede
  anche gli asset liberi?»): with Goal-Based Investing on, `goalAssignedPct`/`goalFreeEur` on each row («obiettivi:
  assegnato 50,0%, libero 6000 €» / «libero da obiettivi») and `portfolio.goalCoverage` closing the OBIETTIVI block
  («Non assegnato a nessun obiettivo: X € su Y €») — FIRE › Obiettivi' own arithmetic, a property NET of the loan that
  finances it (`lib/utils/goalAssetValue.ts`), a loan never a holding a goal can take; with the feature off nothing of
  it is printed (a feature not in use, never a zero). The free figure is printed EVEN when no goal touches the
  instrument («libero da obiettivi (60.000 €)»): without it the model summed the gross values, found the total short
  of the mortgage and called the data inconsistent (the owner's run, 2026-10-20); the coverage line says the property
  is net and tells it to sum the rows' free figures, not the values.
- **The email gets the block too** (owner's decision): `buildEmailAiPrompt` reuses `formatBundleForPrompt`, so the
  periodic comment reads the instruments and the ledger; `__tests__/monthlyEmailService.test.ts` pins it.
- **Every expense window is an ITALIAN calendar window** (`getItalyMonthBoundsUtc`, `getItalyMonthRangeBoundsUtc`,
  `lib/utils/dateHelpers.ts`): the rows are dated at Italian midnight and Vercel runs in UTC, so
  `new Date(year, month - 1, 1)` filed the 1st of a month under the month before — on the owner's account 30 rows
  of 1793 sat in the wrong month for the assistant while Tracciamento had them right. Pinned by
  `__tests__/assistantMonthContextService.test.ts` on ISO instants (green under `TZ=UTC` too).
- **«Entrate» is Tracciamento's figure** (owner's decision): the prompt prints
  `Entrate: X (di cui dividendi e cedole Y; è lo stesso totale della pagina Cashflow)` and the Cashflow tile prints
  Entrate = `totalIncome + totalDividends` with a «di cui dividendi» row — until then the tile printed the income
  WITHOUT the coupons under the same label as the page, and the two disagreed by the month's coupons.
  `cashflow.totalIncome` itself keeps excluding dividends (Σ incomeByCategory === totalIncome).

### Streaming, threads, memory
- **The waiting chip rotates a phrase, it never apologises** (owner, 2026-10-20: «Sta impiegando più del previsto»
  read as a complaint): after `SLOW_RESPONSE_MS` with no text, `StreamStatusChip` shows `SLOW_PHRASES` one at a time
  («Ci sto ragionando…», «Sto facendo i conti…», …), the next every 8 s, from a tick counter the hook resets when the
  stream ends (`useSlowPhrase`, called before the early return — a hook after it is a conditional hook); a web search
  keeps its own «Sto cercando sul web…».
- **The thread list is read 50 at a time** (2026-10-05; it was read whole and grew forever):
  `listAssistantThreads(userId, { limit = ASSISTANT_THREADS_PAGE_SIZE, after })` asks for ONE more than the page,
  so `nextCursor` (the page's last id) is `null` on a list of exactly 50, and the next page starts with
  `startAfter(<cursor snapshot>)` — `startAt` repeats the cursor's thread (seen red: 11 rows, «t049» twice,
  `__tests__/assistantThreadsStore.test.ts`). A cursor of another account is 403, a deleted one 404;
  `GET /api/ai/assistant/threads?after=` validates it (`assistantThreadCursorSchema`: never empty, never a path)
  and answers `{ threads, nextCursor }` with `Server-Timing: auth, db, total`. `useAssistantThreads` is a
  `useInfiniteQuery` whose `select` flattens the pages, on the same key every writer invalidates (an invalidation
  re-reads every loaded page from the fresh cursors). **Nothing hides in silence** (owner's wording, 2026-10-05):
  while a page is unread the list closes on «Mostra altre», the header says «Più di 50 conversazioni»
  (`describeAssistantHeader` `moreThreads`), its icon «Conversazioni (più di 50)» with a «50+» dot (`CountDot`'s
  `isFloor`; past two digits it reads «99+», where it printed a bare «99» until 2026-10-05) and the modal «Le 50
  conversazioni più recenti: premine una per riprenderla; «Mostra altre» legge le precedenti.»
  (`describeThreadsReading` `hasMore`). Seen in the browser on 60 planted threads (2026-10-05, a throwaway spec):
  50 rows, the three sentences, «Mostra altre» → 60 rows, none twice, the button gone.
- **The context route takes the test-snapshot preference from the request** (2026-10-05):
  `GET /api/ai/assistant/context?…&includeDummy=true|false` (`assistantIncludeDummySchema`: anything else is 400).
  The page reads the memory at mount and hands `memory.preferences.includeDummySnapshots` to
  `useAssistantPeriodContext`, so the route no longer reads the memory a second time per opening —
  `getAssistantMemoryDocument` is TWO documents, the memory and the settings behind it, and it ran in series before
  the builder. While the memory has not answered the parameter is absent and the route reads the stored preference
  itself, as it always did. The value is NOT in the query keys: a key that changed when the memory lands would fetch
  every context twice. The builders are untouched (they take the same boolean), and the stream route already took
  its preferences from the request body. Pinned by `__tests__/assistantRoutes.test.ts` (seen red: the memory read
  under a request that carried the value).
- `deleteAssistantThread` must delete the `messages` subcollection in ≤400-doc batches first (no cascade in the Admin
  SDK). Never clear `streamingMessages` in a `useEffect([selectedThreadId])` — the SSE `meta` event sets the id
  mid-stream and wipes the buffer; post-stream invalidation uses a local `resolvedThreadId` updated from `meta`.
- **`max_tokens` budgets thinking AND text together** (`ASSISTANT_CHAT_MAX_TOKENS` 64 000, `ASSISTANT_STRUCTURED_MAX_TOKENS`
  32 000 since 2026-10-20, owner's decision: a consultative question on the allocation ended on TRUNCATION_NOTICE at
  12 000 with Sonnet 5.5 at effort `high`; the route declares `maxDuration = 300`) — re-check whenever the data block
  grows. **Read `stop_reason` from the terminal `message_delta`** and append `TRUNCATION_NOTICE`: a limit either does
  not exist or announces itself.
- **The stream runs with the server-side fallback** (2026-10-12, owner's decision): `anthropic.beta.messages.create` with
  `betas: [SERVER_SIDE_FALLBACK_BETA]` + `fallbacks: 'default'` (`lib/constants/aiModels.ts`, sdk ≥ 0.115). A `cyber` or
  `frontier_llm` decline is re-run on Sonnet 5 inside the same stream — the text already streamed stays, the answer goes
  on, a `fallback` content block marks the switch and the log names both models; the other categories still end on
  `stop_reason: 'refusal'`, which is why `REFUSAL_NOTICE` stays. The history replayed is TEXT only, so a fallback turn needs
  no block stripping; a future replay of thinking or tool blocks owes the echo rules of the fallback docs. Pinned by
  `__tests__/anthropicStream.test.ts` (the request shape).
- **A categorisation rule is compared by exact text and supersedes the active rule on its subject** (2026-11-11):
  «Categorizzazione: {cosa} → {Categoria} › {Sottocategoria}», extracted only when said as a habit
  (`memoryExtraction.ts`); `supersedesCategorizationRule` archives the older rule of the same subject in the turn's one
  transaction, and `dedupeMemoryItems` compares rules by `normalizeText` equality, never Jaccard (one subcategory apart
  is another rule). With memory off the register block prints «Memoria: memoria disattivata.» and the contract tells
  the user where to turn it on; with memory ON and nothing active it prints «Memoria: attiva, nessuna regola salvata.»
  (`REGISTER_MEMORY_EMPTY_LINE`) — with no line at all the model could not tell the two apart and answered the first
  rule on the owner's tour «non posso confermarti che resti salvata» (2026-11-11).
- Memory: only `status === 'active'` items are injected; the fetch is `.catch(() => null)` and never blocks the stream;
  the Anthropic client is lazily imported (a module-level `new Anthropic()` breaks test environments). The context
  bundle lives in React state and is never persisted. `MARKDOWN_COMPONENTS` must be module-level or ReactMarkdown
  re-mounts on every chunk.
- **Do not use `DropdownMenu` for panels containing `Select` or `Switch`** — it closes on any click inside; use
  `Popover`. The Conversazioni modal is controlled and must be closed explicitly in `onSelect`.
- **Merging a partial patch onto existing state: build the merge object with ONLY the fields present in the input**
  (conditional spread), never assign every field unconditionally from a `Partial<T>` — an absent field becomes an
  explicit `undefined` that wins `{...existing, ...patch}` and silently wipes it. `store.ts`'s `mergeMemoryItem`/
  `mergeMemorySuggestion` are the template. A fully-mocked `store.ts` cannot catch this;
  `__tests__/assistantMemoryStore.test.ts` can.
- **One `adminDb.runTransaction` per turn, not one write per mutation**: `extractAndSaveMemory` accumulates every
  candidate/evaluation/suggestion into an `AssistantMemoryMutation[]` applied in one `applyAssistantMemoryMutations`
  call. A new memory-writing feature pushes onto that array — a loop of `updateAssistantMemoryDocument` also races
  against the panel's own PATCH.
- **A field only the GET path can compute (`hasDummySnapshots`) must be optional on the base
  `AssistantMemoryDocument`**, required only on `AssistantMemoryResponse` — never a hardcoded `false` from a write
  helper that cannot know the real value.

### Structured goals (`goalEvaluation.ts` pure, `goalEvaluationService.ts` I/O, `memoryExtraction.ts` extraction)
- **Structure is NEVER parsed from text.** It arrives from a forced-tool-use Haiku call validated with zod. A malformed
  payload discards the **structure**, not the goal — an un-trackable goal is a legitimate state the panel states out
  loud. `unit` is derived from `kind`, never asked of the model.
- **The extraction's `max_tokens` holds the tool input alone** (2048 since 2026-10-12): a forced `tool_choice` on Haiku 5.5
  skips thinking, and the call sends neither `thinking` nor `effort`. The 1024 sized on Haiku 4.5 was doubled for Haiku
  5.5's tokenizer (~30% more tokens for the same text): a cut mid-input fails the zod parse and drops every candidate in
  silence. Haiku 5.5 has no server-side fallback — never add `fallbacks` here.
- **A tool schema's enum description must speak the UI's vocabulary**, or the model splits one sentence across two kinds
  (e.g. "liquidità" is the product's label for the `cash` class).
- **Goals are always evaluated against the CURRENT month**, never the bundle the request happened to build —
  `evaluateActiveGoals` builds its own. Called unconditionally after a chat turn (pass freshly extracted items as
  `pendingItems` to stay within ONE transaction) and daily from the cron's phase 7.
- **`updatedAt` marks the last CONTENT change** (text, category, structured goal, status), which is why
  `mergeMemoryItem` restores it when a patch only stamps an evaluation. The durable "Ignora" compares against it: bump
  it on every re-evaluation and every ignore expires on the next cron run.
- **The caller owns `structuredGoal`**: a goal patch carrying none clears it. The PATCH route restructures on creation,
  on a text edit, or when the goal has none — never on a status-only change — and on failure leaves the goal
  unstructured rather than keeping a structure that contradicts the new text.

### Goal-Based Investing in the bundle (`goalMath.ts` + `lib/server/goalData.ts`, prompt section, `GoalProposalCard`)
- **`bundle.goals` is REQUIRED and nullable**: `null` means the feature is off or the user has no document, and the
  prompt says so in words. Absent ≠ off ≠ empty — a model cannot tell them apart, and the data rules then make it answer
  "N/D" about a feature the user simply does not use. *Enabled but no goals* gets its own sentence.
- **`targetAllocationSource` exists because the app can stop using the manual targets.** With
  `goalDrivenAllocationEnabled` on, Allocazione overrides them with `deriveTargetAllocationFromGoals`; quoting the
  Settings ones would be right numbers about the wrong thing. `buildGoalFields` derives goals, targets and source in ONE
  pass, falling back to the manual targets when the derivation yields null, mirroring the page.
- **A quota reaches the model only as euro** (2026-10-17): a quota is a percent of the asset or a number of its units
  (`GoalAssetAssignment`, doc/guide/fire.md), and the bundle carries each goal's `currentValue` through
  `calculateGoalProgress`, which converts both forms (`assignmentFraction`); the prompt's goals block says a quota is
  «in percentuale o in quote … già convertita in euro qui» and the ```goal-proposal schema carries NO assignment at all —
  the model never sees a field the type does not have, and a proposal creates a goal, never a quota.
- **Carry the trajectory numbers, don't make the model compute them**: `requiredMonthlyContribution` and
  `projectedValueAtDeadline` ship with `assumedAnnualReturn` and are labelled **projections** — a required pace without
  its return assumption cannot be audited, and a model without them multiplies contribution × months, ignoring
  compounding. Present only for goals with BOTH a target and a deadline; absent otherwise, never zero.
- **THE PROPOSAL PROTOCOL: the AI never writes.** It emits ONE fenced ```goal-proposal block of pure JSON; the write
  happens only on the user's Conferma, through `POST /api/goals` — or, since 2026-10-20, `PATCH /api/goals` when the
  block carries `goalId` (the id the OBIETTIVI block prints): the card reads «Modifica di un obiettivo», every row
  before → after, and the route rewrites that goal in place (`updateInvestmentGoal`, transactional, colour and creation
  date kept, the optional fields REPLACED — a proposal that drops the deadline removes it; 404 when the goal is gone).
  `assignments` names instruments by their EXACT name from the STRUMENTI block with a percent of each; the CARD resolves
  the names to asset ids (`findAssetByName`, lib/utils/allocationAdviceApply.ts: the exact name, the printed «name
  (TICKER)» form, or the ticker alone with or without its exchange — the owner's run of 2026-10-20 had the model write
  «… (SWDA)» for «SWDA.MI»; the `displayTicker` alias counts as a ticker, because the block prints it in its place —
  on 2026-10-23 two ETCs ticked «ISIN.SG» reached the model by their alias and their quotas were lost) and the route takes `{ assetId, percentage }` through `goalWriteAssignmentsSchema`,
  refusing a sum past 100% on one asset. On an update present quotas replace the goal's, absent ones leave them, and
  **one unmatched name keeps EVERY quota of today** (`keepQuotas`: the card sends no `assignments` and its eyebrow
  says so) — the first version wrote the resolved list, which was empty, and wiped a goal's quota of an ETF on the
  mirror. On a creation an unmatched name is shown in amber and left out. `lib/utils/goalProposal.ts` owns the ONE zod schema
  for both the block and the route body (client-safe, since the card validates before rendering). In zod 4 use
  **`z.partialRecord`** for `recommendedAllocation` — `z.record` with an enum key demands every key.
- **Intercept the block on `pre`, not on `code`** (a card inside `<pre>` is invalid nesting), and a malformed payload
  MUST fall through to a normal code block — the user still sees what the model wrote. A goal block the model put
  inside a quote or behind a list marker is still a card, keyed AFTER the top-level ones (`listNestedFencedBlocks`,
  2026-11-11: the keys derived from the message had turned it into code; an expense block there stays code — its
  prompt asks for lines of its own). `GoalProposalCard` reads owner,
  demo mode and query client itself because `MARKDOWN_COMPONENTS` has to stay module-level.

## Assistente — a verdict over tiles (`components/assistant/AssistantPageClient.tsx`, `components/assistant/tiles/*`, `lib/utils/assistantNarrative.ts`)
- **The verdict is the context, and the page computes nothing**: `buildAssistantPeriodVerdict(bundle, today)` reads the period
  bundle the prompt receives (`selector`, `netWorth`, `cashflow`, `dataQuality`) and `buildNoContextVerdict(toNoContextVerdictInput(overview,
  month))` reads the Panoramica payload for a Libera question with no context — `buildOverviewVerdict` verbatim, never a second
  phrasing. `today` is a PARAMETER (`getItalyMonthYear` once per mount).
- **Tense follows the period, and the bundle has no market attribution**: a closed month «è andato bene / in calo», a closed year
  «è stato un anno in crescita», the running year and YTD «finora va bene», the history «è cresciuto»; growth with spending over
  income is a warning («è cresciuto, ma le spese hanno superato le entrate»). `allocationChanges` are purchases + prices, so the
  verdict NEVER says «il mercato ha pesato» here, and the old context card's sign-coloured class rows are gone. `netWorth.end ===
  null` (a month without its snapshot; the running month is `isPartialMonth`) → «Di luglio conosco solo il cashflow.» /
  «Agosto è ancora in corso.» with the cashflow figures; no snapshot AND no cashflow → «Nessun dato per …».
- **The savings rate is `netCashFlow / (totalIncome + totalDividends)`** (`resolveSavingsRate`), null without inflows; the
  Cashflow tile's reading is the Panoramica's `describeCashflow` on it (no month-over-month delta: the bundle carries one period).
- **Every count on the page is a sentence from the pure layer**: the header's description (`describeAssistantHeader`), the
  Conversazione reading (`describeConversation` — the period question while empty, then «2 messaggi; la risposta usa i numeri di
  luglio 2026 e una ricerca web» with `formatPeriodInSentence`), «Cosa sa di te» (`describeMemory`), the sheet's Obiettivi and
  Fatti (`describeGoalsTile`, `describeFactsTile`), a goal's state (`describeGoalProgress`: «Raggiunto» · «14.300 € / 20.000 €» ·
  «Non tracciato», the percent kind with the comma — the memory rows' `toFixed` retired with it).
- **Rows, not chips, inside a tile**: `AssistantPromptRows` renders the starter questions (the one whose `chip.mode === mode`
  first and bold) and the follow-ups; a row is `min-h-11` below `desktop:`. A starter still PREFILLS the composer (the period must
  be confirmed); a follow-up acts by its `action`: absent, the mode's behaviour (it submits, in Registra it prefills the
  composer); `send` submits; `focus-composer` empties and focuses the composer («Registra un'altra», first after a
  written card, 2026-11).
- **Layout**: `PageContainer` (1920, its only width); verdict + `AssistantPeriodSelector` (in Registra the strip with «Torna all'analisi» in its place, `RegistraContestoTile` in the companion) in `flex desktop:flex-row desktop:justify-between`;
  the grid is `desktop:grid-cols-[2fr_1fr] desktop:items-start`, the companion `desktop:sticky desktop:top-5 desktop:self-start`
  (sticky needs self-start, AGENTS.md § Tailwind Breakpoints) and it renders AFTER the composer on a phone; the composer stays
  `sticky bottom-0 max-desktop:portrait:bottom-20` inside the left column. The pill's strip bleeds `max-desktop:-mx-4
  max-desktop:px-4` (the page padding) and its tabs are 44px there. `TileGridSkeleton` with `cells={[]}` is the verdict's
  placeholder while a bundle loads.
- **Messages are flat** (`AssistantStreamingResponse`): the user's in a `bg-muted/40` sub-tile, the assistant's full-width prose;
  the proposal cards (`GoalProposalCard`, `ExpenseProposalCard`) are `not-prose` blocks with the AI accent (DESIGN.md → The
  AI-Accent Rule), never a card in the tile; `MARKDOWN_COMPONENTS` stays module-level. The
  streaming badge lives in the tile's aside (`role="status"`); the interruption notice is a muted row with «Rigenera».
- **Conversazioni and Memoria are `ResponsiveModal`s** (`AssistantModals.tsx`, 2026-09-18 — two right-side `Sheet`s
  until then): `md` and `lg`, eyebrow «Assistente · …», the title the act («Riprendi una conversazione») or the
  companion tile's own name («Cosa sa di te», opening on the SAME `describeMemory` sentence the tile shows), no
  footer. The thread rows are flat and divided, the active one `aria-current` on `bg-muted`; their delete is
  `useArmedDelete` with `THREAD_DELETE_CONSEQUENCE` printed in the row in place of the preview and ONE live region
  for the list. They stay overlays for the reason the sheets were: the companion column must never become a second
  nested-scroll box.
- **The memory modal is two sub-tiles + an «Archiviati» disclosure**: the Attivi/Completati/Archiviati tabs are gone; a pending «goal
  reached» suggestion shows on its goal's row (the durable «Ignora» is `ignoreSuggestion`, the same mutation the tile above the
  conversation uses — two surfaces of ONE suggestion); the item delete is `useArmedDelete` (two clicks, no timer).
  `AssistantMemoryPanel` lost its collapsible variant (only the sheet renders it).
- **The guide is `AssistantComeFunziona`**, a Collapsible below the grid with three tiles; the header has four icon actions (Registra, 2026-11) and
  ONE primary; Conversazioni and Memoria wear their count as a dot AND the description says it in words (the dots were
  dropped once and asked back the same day). Playwright locates: the verdict by `region` «Verdetto sul
  contesto», the tiles by their eyebrow («Conversazione» with `exact: true` — «Conversazione con l'assistente» is the live
  region), the rows by `list` «Domande suggerite», the axis by `tablist` «Periodo di analisi», the disclosure by `button` «Come
  funziona».

## The visual direction

The whole page follows DESIGN.md § 5 → «AI Surfaces», concept B «La scena» (chosen by the owner on 2026-11-06 among three
drawn concepts, archived in `git log -- doc/ai/reference/`): **The AI-Accent Rule** (the accent on the «Assistente» sub-eyebrow of a model's message, on
proposal and question cards, and on the hover of «Invia messaggio», «Registra», «Rigenera», «Rispondi» and the suggestion rows;
never on the verdict, the companion column, the thread list or the user's messages), **The Question-Card Rule** (the
cards inside a message, ONE «Rispondi» under the last) and the paragraph «The Assistente page» (the conversation stays
still, the companion column's content slides with the mode). The code follows it from the Registra mode on (2026-11): the companion slides with `sceneVariants`, the cards enter with `cardEnterVariants`.

## Registra (2026-11)

«Ho fatto spesa per 103 euro» becomes a card; «Conferma» writes the row through the expense form's services (a series
or a fee: the form's batch of documents); a reload never writes it twice. Since 2026-11-11 also transfers (onto a house too), instalments, series, fees and new categories,
and the Assistente asks what it needs with options before proposing.

- **The mode** is `register`, handled EXPLICITLY at every site of the WARNING comment that opens `types/assistant.ts`
  (the true list; none falls through to chat). It has no period: the stream body carries no month, the context route
  answers 400, `useAssistantPeriodContext` is never enabled, it is not a tab of `AssistantPeriodSelector`, web search is
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
- **The way in and out**: the pencil in the header («Registra un movimento», off in demo and while streaming)
  or `?mode=registra`, once the thread list has resolved; the strip «Registra · l'Assistente conosce categorie, conti e
  le ultime righe» stands where the period axis was (and the header's title reads «Una frase, una riga» instead of «Un periodo, una risposta», 2026-11-11), with «Torna all'analisi» — which leaves the thread FIRST (the mode
  alone would send the next question into it) and drops the param. The thread is one per Italian day, «Registrazioni ·
  1 nov 2026» (`buildThreadTitleFromPrompt`, `findRegisterThread`); entering reopens today's — the day is read at
  the ENTRY (`enterRegister`), never once at mount: a page open since yesterday reopened yesterday's thread (2026-11-11). **With no thread picked, the
  day's thread IS the open one, derived in render** (`selectedThreadId = pickedThreadId ?? the day's`, 2026-11-11): on the
  owner's tour a sentence sent after the browser's Back from Cashflow opened a SECOND «Registrazioni» of the same day —
  the mode had been entered while the list did not hold the thread, and a lookup made once at the entry never looked
  again. So «Nuova conversazione» is OFF in Registra (2026-11-11, the owner's tour: it reopened the day's thread and
  seemed to do nothing), named «Nuova conversazione — Registra tiene un thread al giorno» (`newThreadLabel`,
  `__tests__/assistantHeader.test.tsx`); «Torna all'analisi» is the way out, and a clean register thread is had only by
  deleting the day's.
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

## Composizione mobile

No composition, by design: the page's content is a conversation (DESIGN.md → The Conversation-Is-Content Rule), not a grid of tiles answering one question — below `desktop:` the conversation and its composer are the page and the companion tiles follow them in one column; nothing is closed, lifted or remembered (no `mobile-sections:` key). It is not one of the nineteen surfaces of `mobile:census`.

## Per-page blind spots

- **Assistente**: the analysis modes have no Playwright spec; the Cashflow tile is absent for a period without cashflow rows; the savings rate is `netCashFlow / (income + dividends)`; «Patrimonio oggi» prints the GROSS total (the verdict's figure), the old card printed the net; the Conversazione count includes the user's messages; starter rows prefill the composer, follow-up rows act by their `action` (in Registra they prefill, «Registra un'altra» empties); the thread rows and the memory rows both use `useArmedDelete` (the threads' 3 s auto-disarm went on 2026-09-18, with the sheet); a companion taller than the viewport is reachable only at the end of the scroll (sticky, by design); the «goal reached» tile and the sheet's row are two surfaces of ONE suggestion.
- **The Assistant's cashflow figures changed on 2026-07-29 and again on 2026-10-20** (the Italian month bounds, «Entrate» with the coupons inside); saved threads are prose and are not regenerated (moved here from CLAUDE.md → Known Issues on 2026-09-18: it is this page's blind spot, not a cross-cutting one).
- **The portfolio block is TODAY's, whatever the period** (2026-10-20): the instruments, the allocation on the base, the ledger and the registers describe the portfolio at the time of the question; only the snapshot blocks and the cashflow are the period's. A question about a past month reads today's holdings beside that month's figures — the system core says so.
- **A period's own thread older than the pages read is not found** (owner's call, 2026-10-05): switching period
  re-opens the existing thread for it by scanning the LOADED threads (`findThreadForPeriod`), so with more than 50
  conversations one older than the 50 most recent is not resumed and the next question opens a new one — until
  «Mostra altre» has read its page. No query of its own, by decision.
- **The context preview reads the page's copy of the test-snapshot preference** (2026-10-05), not the stored one:
  the two differ only when the preference was changed from another device inside the memory query's five minutes. It
  is the toggle of test accounts, shown only where dummy snapshots exist.
- **The stream route reads the memory twice per message, on purpose** (read against the code on 2026-10-05):
  once before the answer, for the active items the prompt carries, and once in `extractAndSaveMemory`, after the
  stream has closed — possibly a minute later. The second read is what honours a `memoryEnabled` switched off while
  the answer was streaming, and what dedupes against an item added from the panel meanwhile; it runs in the
  background, off the reader's wait. Do not hand the first read down to it.
- **Every message reads the whole cashflow history** (owner, 2026-11-07): the route's
  `readCashflowBlockForPrompt` reads every expense row up to the Italian end of the month 12 ahead, in every mode,
  apart from the period's own read — a period's rows are read twice, and the read grows with the history. Accepted:
  one Admin query per message, off the browser; the block is never cached across messages, so a row confirmed a
  minute ago is in the next answer.
- **A card's outcome is saved on its message** (2026-11): a reload shows «Obiettivo creato» / «Registrata». The one window left: a PATCH that fails after a successful write (the toast of either card says so); a reload then shows the card idle. A thread refetch landing between the local record and the PATCH can also drop the outcome from the cache — the stream buffer still shows it for the session.
- **A Registra day past 100 messages shows its oldest 100** (`getAssistantThreadDetail` reads `orderBy createdAt asc, limit 100`), and the history is cut from those.
- **A row written from Registra carries no mark**: in Tracciamento it is a row like any other — and never «Legata all'immobile»: «Modifica» sets it.
- **A question is answered by a message** (2026-11-11): the thread shows the answer lines as the user's message, and the read-only cards above it.
- **What Registra does not do** (owner, 2026-11-01): it never edits or deletes an existing row (the writer is the
  card's «Conferma», once, through today's services — never a new server route); no receipt attachments and no voice;
  no per-user «always ask the account» setting (the asking policy is the contract's thresholds); it is a mode of the
  Assistente, never a page under Cashflow; what belongs to ONE mode never enters `formatBundleForPrompt` or
  `ASSISTANT_SYSTEM_CORE`, which the emails read too.
- **Memory is the account's**: the owner and a co-owner share the categorisation rules; two wordings of one subject («palestra», «la palestra») stay two rules.
- **The Cashflow bridge reads the key at build, as this page does**: `app/dashboard/cashflow/page.tsx` passes `Boolean(process.env.ANTHROPIC_API_KEY)`; a key added on Vercel shows «Chiedi all'Assistente» after the next deploy.
- **IL MESE's totals are as fresh as the Panoramica's summary** (2026-11): the first line is the server summary, the lines under it are computed from the rows read for the message; a row written outside the app's services (an Admin write, a restore) leaves the two apart until the summary is rebuilt — seen on the emulator after a spec's Admin deletes.
- **Registra adds about 25 KB gz to the page's first load** (2026-11-10, the ceiling raised with the owner's OK: doc/guide/velocita.md § Registro): the card's services, the protocol and the four reads ship with the page; only `ExpenseDialog` is lazy. Loading the three write services on «Conferma» was measured at −0,9 KB and dropped. The questions and the four kinds added 13,3 more on 2026-11-11 (738,1 → 751,4, ceiling 753).
