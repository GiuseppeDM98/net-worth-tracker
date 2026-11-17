# Assistente AI

> **When to open this guide** — whoever touches `app/dashboard/assistant/*`, `components/assistant/*`,
> `lib/server/assistant/*`, `lib/services/assistantMonthContextService.ts`,
> `lib/utils/{assistantChatNarrative,assistantNarrative,assistantNetWorthDrivers,assistantPeriodOptions,assistantQuestionBlocks,assistantRegisterContext,assistantRoute,assistantStreamBuffer,cashflowBlock,expenseBreakdown,expenseProposal,goalProposal}.ts`,
> `lib/hooks/useAssistantStreaming.ts`, `app/api/ai/assistant/*`, `app/api/goals/route.ts`. In
> `AGENTS.md` the stub with the essentials stays; here is the full rule. Modules and files: § *Files* below.
> E2E: `e2e/assistant.chat.spec.ts` and `e2e/assistant.chat.mobile.spec.ts` (the page as a chat, 2026-11-16),
> `e2e/assistant.register.spec.ts`, `e2e/assistant.register.mobile.spec.ts`, `e2e/assistant.register.{kinds,question}.spec.ts`
> and `e2e/assistant.register.question.mobile.spec.ts` (Registra) — the stream always faked with `page.route`, helper
> `e2e/assistantRegister.ts`; no spec asserts an analysis's answer.
> **Registra** (the `register` mode: card, questions, write, outcome) has its own guide since 2026-11-16:
> doc/guide/assistente-registra.md.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Assistant**: `app/dashboard/assistant/page.tsx`, `components/assistant/AssistantPageClient.tsx` + `tiles/*`, pure `lib/utils/{assistantNarrative,assistantPeriodOptions}.ts`; `app/api/ai/assistant/*`, `lib/server/assistant/*` (`goalEvaluation.ts` pure, `goalEvaluationService.ts` I/O, `memoryExtraction.ts`, `router.ts` — the router of `mode: 'auto'` —, `store.ts` → `mergeMemoryItem`), pure `lib/utils/assistantRoute.ts` (the reading's contract), `components/assistant/AssistantModals.tsx` (Conversazioni · Memoria · Preferenze, the fields in `AssistantPreferencesFields.tsx`), the chat (2026-11-16): `components/assistant/AssistantRouteChooser.tsx` («cambia»), `AssistantWaiting.tsx` (the wait), pure `lib/utils/assistantChatNarrative.ts` (the reading line, the suggestions, the wait's phrases), `lib/hooks/useAssistantStreaming.ts`, `lib/services/assistantMonthContextService.ts` over `lib/utils/expenseBreakdown.ts` (`buildCashflowBreakdown`) and `lib/utils/cashflowBlock.ts` (the CASHFLOW 12 MESI block, its rules in doc/guide/consulente.md § The run); goals `lib/server/goalData.ts`, `lib/utils/goalProposal.ts` (ONE zod schema), `app/api/goals/route.ts`, `components/assistant/GoalProposalCard.tsx`
- **The portfolio block** (2026-10-20): pure `lib/utils/assistantPortfolioContext.ts` (`buildAssistantPortfolioContext`, `emptyAssistantPortfolioContext` for the fixtures), printed by `formatPortfolioForPrompt` in `prompts.ts`; the Italian month bounds `getItalyMonthBoundsUtc`/`getItalyMonthRangeBoundsUtc` in `lib/utils/dateHelpers.ts`. The Consulente of Allocazione is its own guide: doc/guide/consulente.md.
- **Suites to run after a change here — Assistant** (moved from `AGENTS.md` § Commands on 2026-09-30): `assistantRoutes`, `assistantThreadsStore` (the pages and the cursor), `assistantRouter`, `assistantRoute`, `assistantWebSearchPolicy`, `assistantMonthContextService`, `assistantPortfolioContext`, `assistantPromptBundle`, `dateHelpers`, `cashflowBlock`, `anthropicStream`, `assistantNetWorthDrivers` · **The page as a chat** `assistantChatNarrative`, `assistantPeriodOptions`, `assistantRouteChooser`, `assistantHeader`, `assistantCompanionScene`, `assistantStreamingResponse`, `assistantQuestionBlock`, `useAssistantStreaming` (the `.tsx` ones on the `dom` project; `AssistantWaiting` has no suite of its own) · **Verdetto e letture** `assistantNarrative` (+ `overviewNarrative` for the no-context verdict) · **Obiettivi** `assistantGoalEvaluation`, `assistantGoalEvaluationService`, `assistantMemoryExtraction`, `assistantMemoryStore` · **Goal-Based** `goalMath`, `goalProposal`, `apiAuthRoutes` · **Email** `monthlyEmailService` (the same block)

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
  every held instrument with class, sub-category, ROLE, quantity, value, fee-free PMC and G/P in euro, owner
  (`describeAssetOwnerLabel`), liquidity; the allocation on the Allocazione page's base; the ledger (a fee with its
  spending row prints «commissioni X (già fra le spese)», `feeIsSpendingRow`, 2026-11-12, so the AI never counts it
  twice beside the cashflow block); the dividend
  registry in its two halves and the coupon of every bond held; the pension funds with their contributions by tax
  year and nature and, in a bundle with a period, `paidInPeriod`: the contributions that moved the fund's value in
  the period, by the month they were RECORDED (`valueEffectMonth`, the rule of Previdenza and of the Panoramica's
  «versati nel fondo pensione»), each with its competence date and the day it was recorded, and one prompt rule —
  take the paid-in out before blaming the market for a fund's change or its class's (owner, 2026-11-16: September's
  contributions recorded in October read as an unexplained October jump of the bond class). Each builder passes its
  months through `portfolioPeriod` (`assistantMonthContextService.ts`); the portfolio of today carries none;
  and every analysis bundle carries `netWorthDrivers` (2026-11-16, owner: «Il sistema non scompone la variazione»):
  the period's change split as Storico's Driver splits it (`buildAssistantNetWorthDrivers`,
  `lib/utils/assistantNetWorthDrivers.ts`, over `buildMonthlyGrowthDrivers` + `sumGrowthDrivers`), from the snapshot
  before the period to the one it closes on, printed after PATRIMONIO as «DA DOVE VIENE LA VARIAZIONE» with the rule
  «non stimarlo per differenza»; null without both snapshots or across a month with none (the parts would no
  longer add up); each class of «VARIAZIONI ALLOCAZIONE» carries `pension` (2026-11-16): the funds' change in it from
  both snapshots' `pension.byAssetClass` and the contributions recorded in the period split by each fund's
  `composition` (`pensionPaidInByClass`), printed as «› di cui fondi pensione: Δ …, di cui versati …; il resto della
  classe: Δ …» — null when a snapshot does not record the funds' part (old and hand-entered ones); the income
  categories carry their subcategories (`IncomeCategoryBreakdown.subCategories`, only when a row names one) and the
  prompt prints them like the expenses'; the loans; the household (`familyMembers`, `userAge`). `formatPortfolioForPrompt` prints every
  list whole or declares the cut (`PORTFOLIO_LEDGER_ROW_CAP` 300, `PORTFOLIO_DIVIDEND_ROW_CAP` 150, the oldest rows
  dropped, the omission written) — the silent-cap rule above. A full portfolio fits in a few thousand tokens.
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
  instrument («libero da obiettivi (50.000 €)»): without it the model summed the gross values, found the total short
  of the mortgage and called the data inconsistent (the owner's run, 2026-10-20); the coverage line says the property
  is net and tells it to sum the rows' free figures, not the values.
- **The email gets the block too** (owner's decision): `buildEmailAiPrompt` reuses `formatBundleForPrompt`, so the
  periodic comment reads the instruments and the ledger; `__tests__/monthlyEmailService.test.ts` pins it.
- **Every expense window is an ITALIAN calendar window** (`getItalyMonthBoundsUtc`, `getItalyMonthRangeBoundsUtc`,
  `lib/utils/dateHelpers.ts`): the rows are dated at Italian midnight and Vercel runs in UTC, so
  `new Date(year, month - 1, 1)` filed the 1st of a month under the month before — every row dated on
  a 1st sat in the wrong month for the assistant while Tracciamento had them right. Pinned by
  `__tests__/assistantMonthContextService.test.ts` on ISO instants (green under `TZ=UTC` too).
- **«Entrate» is Tracciamento's figure** (owner's decision): the prompt prints
  `Entrate: X (di cui dividendi e cedole Y; è lo stesso totale della pagina Cashflow)` and the Cashflow tile prints
  Entrate = `totalIncome + totalDividends` with a «di cui dividendi» row — until then the tile printed the income
  WITHOUT the coupons under the same label as the page, and the two disagreed by the month's coupons.
  `cashflow.totalIncome` itself keeps excluding dividends (Σ incomeByCategory === totalIncome).

### Streaming, threads, memory
- **The wait speaks in the answer's place, from the first instant** (owner, 2026-11-16: «come fai tu su Claude
  Code»; it replaced the chip's `SLOW_PHRASES` after 15 s of 2026-10-20 and the hook's `isSlowResponse`): while the
  streaming message has no text, `AssistantWaiting` (`components/assistant/AssistantWaiting.tsx`) shows a pulsing ✦ in
  the AI accent and one phrase at a time, the next every `WAITING_PHRASE_MS` (3 s), with a light passing over it
  (`.assistant-waiting-phrase` in `app/globals.css`, only under `prefers-reduced-motion: no-preference`; under reduce the
  mark and the shimmer stand still and the phrases still turn). The phrases are `buildWaitingPhrases(reading, status)`
  (`lib/utils/assistantChatNarrative.ts`): «Sto leggendo la domanda…» until the `route` event, «Sto cercando sul web…»
  on the `searching` status, then by the reading — «Apro ottobre 2026…» and the analysis's two steps, «Cerco la
  categoria giusta…» for a registration, «Ci sto ragionando…» for a free question. Never an operation the server is
  not doing. A new list remounts by its key and starts from its first phrase. The phrases are `aria-hidden`: the
  message list is a live region, and a screen reader hears one sr-only «L'assistente sta preparando la risposta.»
  instead of a phrase every 3 s; a search, which can last a minute, alternates «Sto cercando sul web…» and «Leggo i
  risultati…». `StreamStatusChip` in the tile's aside now shows the web search only. An answer
  already begun that stops for a search shows the wait again UNDER its text while the status is `searching`.
- **The companion column is clipped** (2026-11-16, `overflow-clip [overflow-clip-margin:4px]` in `AssistantPageClient`):
  every routed answer can change the scene, and its sideways slide pushed a phone's `main` 8px wide until it
  ended (`assistant.chat.mobile.spec.ts` red 3 runs in 4); the margin keeps the tiles' shadow.
- **The status says what the server is doing now** (2026-11-16, `anthropicStream.ts`): `'writing'` at the start
  even with the web allowed, `'searching'` only from a `server_tool_use` block, `'writing'` again at the first
  text after it; the text that resumes after a search starts a new paragraph («materie prime.**In sintesi**» on
  the owner's run). Each `web_search_tool_result` is logged — `[assistant] web search failed: <error_code>` or the
  number of results — so an answer that says the web was unavailable can be checked in the server log. On the
  owner's run two searches returned 9 results each while the answer said «la ricerca web non era disponibile»: the
  prompt's web section now says to write that the search found no dated events, never that it was unavailable.
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
  (`describeAssistantHeader` `moreThreads`), the «⋯» menu's item «Conversazioni (più di 50)» (`threadsLabel` in
  `AssistantHeader.tsx`; an icon with a «50+» dot until 2026-11-16, when the header became «⋯») and the modal «Le 50
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
  `Popover` or a modal: Preferenze is a modal since 2026-11-12, opened from the header's «⋯» menu. The Conversazioni modal
  is controlled and must be closed explicitly in `onSelect`.
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

### The router (2026-11)
- **`mode: 'auto'` is read by ONE forced-tool Haiku 5.5 call before any builder** (`routeAssistantMessage`, `router.ts`):
  intent (one of the six modes), period, web search, confidence; `routeToSelection` (`lib/utils/assistantRoute.ts`) turns
  the reading into today's request fields, so the pipeline after it is an explicit mode's. An explicit mode never calls it.
  The `route` event goes right after `meta`; the assistant message stores it as `routeReading` (no `elapsedMs`).
- **A route in the request** (`route`, only with `'auto'`, which never carries `month`/`year`/`chatContext`) skips the
  router, stamped `confidence: 1`: `source: 'override'` when the owner chose it, `'carried'` with `routeCarried: true`
  (a reading the turn inherits — an answer to a question card, «Rigenera»); one `checkRouteConsistency` refuses (an
  analysis on another period, a month or year after today, Registra with the web) is a 400 after `assertCanAccessAccount`.
- **It never throws**: an SDK error, a timeout (4 s, no retry), no tool block, an invalid input or a confidence below 0.6
  give the fallback — a free question with no period — with its `reason` (`error`, `timeout`, `invalid`,
  `low-confidence`). A Registra reading drops its period.
- **The web**: Registra never; an `'override'` its own flag, as it is; the router AND a `'carried'` reading only ADD to
  today's policy (owner, 2026-11-16: «Contesto macro» on keeps searching on a carried turn); an analysis read with a
  reading gets `includeMacroContext` = the effective decision, so its macro sentence and the tool agree.
- **Cost** ≤ $0.00047 a message, ≤ 4 s, none for a route in the request; logged `routeSource`, `routeReason`, `routerMs`.
  `system` is a constant; the previous turn is the thread's LAST assistant message and the user message right before it
  — a last answer without a reading (an explicit mode) gives none, and the router is never told of an older one. Faked
  by a `RouterClient` with a `vi.fn()` `create` and `vi.mock` of the module; the thread's detail is its last 100 messages.

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
  the names to asset ids (`findAssetByName`, lib/utils/allocationAdviceApply.ts — the held instruments first, so one at
  quantity 0 with the same name or ticker never wins, 2026-11-12: the exact name, the printed «name
  (TICKER)» form, or the ticker alone with or without its exchange — the owner's run of 2026-10-20 had the model write
  «… (ABCD)» for «ABCD.MI»; the `displayTicker` alias counts as a ticker, because the block prints it in its place —
  on 2026-10-23 ETCs ticked «ISIN.SG» reached the model by their alias and their quotas were lost) and the route takes `{ assetId, percentage }` through `goalWriteAssignmentsSchema`,
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
  month))` reads the Panoramica payload for a free question with no period — `buildOverviewVerdict` verbatim, never a second
  phrasing. `today` is a PARAMETER (`getItalyMonthYear` once per mount).
- **Tense follows the period, and the bundle has no market attribution**: a closed month «è andato bene / in calo», a closed year
  «è stato un anno in crescita», the running year and YTD «finora va bene», the history «è cresciuto»; growth with spending over
  income is a warning («è cresciuto, ma le spese hanno superato le entrate»). `allocationChanges` are purchases + prices, so the
  verdict NEVER says «il mercato ha pesato» here, and the old context card's sign-coloured class rows are gone. `netWorth.end ===
  null` (a month without its snapshot; the running month is `isPartialMonth`) → «Di luglio conosco solo il cashflow.» /
  «Agosto è ancora in corso.» with the cashflow figures; no snapshot AND no cashflow → «Nessun dato per …».
- **The savings rate is `netCashFlow / (totalIncome + totalDividends)`** (`resolveSavingsRate` = `meaningfulSavingsRate`),
  null without inflows and below the savings floor (2026-11-12); the Cashflow tile's reading is the Panoramica's
  `describeCashflow` on the period's `readSavings` (no month-over-month delta: the bundle carries one period). **The
  words read the reading, not the number**: `savingsClause`, `cashflowOnlyClause`, `resolveTone` and
  `describeAssistantCashflow` take `periodSavings(cashflow)` and treat a `deficit` as a negative rate — had they kept
  branching on `null` (the spec's assumption that the swap «changes nothing printed»), 3 € in and 500 € out would have
  read «Nessuna entrata registrata» with a positive tone. Pinned by `__tests__/assistantNarrative.test.ts` («is null
  below the savings floor, while the words still say…»). Both savings sentences take the article from the figure as
  printed («l'81%», The Comma Rule, 2026-11-14).
- **Every count on the page is a sentence from the pure layer**: the header's description (`describeAssistantHeader`), the
  Conversazione reading (`describeConversation` — `EMPTY_CHAT_QUESTION` while empty, then «2 messaggi; la risposta usa i numeri di
  luglio 2026 e una ricerca web» with `formatPeriodInSentence`), «Cosa sa di te» (`describeMemory`), the sheet's Obiettivi and
  Fatti (`describeGoalsTile`, `describeFactsTile`), a goal's state (`describeGoalProgress`: «Raggiunto» · «14.300 € / 20.000 €» ·
  «Non tracciato», the percent kind with the comma — the memory rows' `toFixed` retired with it).
- **Rows, not chips, inside a tile**: `AssistantPromptRows` renders the four suggestions of an empty chat
  (`buildEmptyChatSuggestions`, `lib/utils/assistantChatNarrative.ts`: from what the account holds — no payload yet,
  nothing, assets only, a cashflow —, the first bold; `?mode=registra` puts the three register rows first; four
  `Skeleton` rows while the Panoramica payload loads) and the follow-ups; a row is `min-h-11` below `desktop:`. A
  suggestion only WRITES the composer (a register row is a sentence to finish), the caret at the end, and sends
  nothing; a follow-up acts by its `action`: absent, the last answer's mode decides (it submits, after a registration
  it prefills the composer); `send` submits, with no route (the router reads it again); `focus-composer` empties and
  focuses the composer («Registra un'altra», first after a written card, 2026-11).
- **The page as a chat (2026-11-12)**: no period axis, no mode to enter. Every send is `mode: 'auto'`
  (`useAssistantStreaming`); the stream's `route` event sets the turn's `mode` and the answer's `routeReading`, and
  the page is shown in the LAST answer's mode (`displayMode`: verdict, companion scene, register reads). The
  placeholders are born with the last answer's mode, so a turn never slides to a free question while the router
  reads. Under a complete answer with a reading the line «Ho letto: … · cambia» (`describeReadingLine`; «Hai scelto»
  for an override, «Non ne sono sicuro: l'ho letta come …» for a fallback, « · con ricerca web» from `webSearchUsed`);
  «cambia» on the last answer only, at rest, outside the demo, opens `AssistantRouteChooser` (the focus on the chosen reading; Esc and «Annulla» bring it back to «cambia» through the
  page's `changeOpenerRef`, Safari's click included) and «Rileggi» re-sends the
  last prompt as a new turn with the chosen route (no `routeCarried`), the focus on «Interrompi risposta». A question
  card's answer and «Rigenera» carry the reading (`routeCarried: true`). The open thread is `?thread=<id>`, written
  with `history.replaceState` at a new thread's `meta` and removed by «Nuova conversazione». Testing the page
  (`__tests__/assistantCompanionScene.test.tsx`): `AnimatePresence mode="wait"` keeps the exiting scene in the DOM, so
  a scene is proven by the verdict's text after the exit (400 ms), never by the companion alone; a question card's
  answer also PATCHes its message, so the stream calls are counted by URL.
- **Layout**: `PageContainer` (1920, its only width); the verdict alone above the grid (`RegistraContestoTile` in the companion after a registration);
  the grid is `desktop:grid-cols-[2fr_1fr] desktop:items-start`, the companion `desktop:sticky desktop:top-5 desktop:self-start`
  (sticky needs self-start, AGENTS.md § Tailwind Breakpoints) and it renders AFTER the composer on a phone; the composer stays
  `sticky bottom-0 max-desktop:portrait:bottom-20` inside the left column. The pill's strip bleeds `max-desktop:-mx-4
  max-desktop:px-4` (the page padding) and its tabs are 44px there. `TileGridSkeleton` with `cells={[]}` is the verdict's
  placeholder while a bundle loads.
- **Messages are flat** (`AssistantStreamingResponse`): the user's in a `bg-muted/40` sub-tile, the assistant's full-width prose;
  the proposal cards (`GoalProposalCard`, `ExpenseProposalCard`) are `not-prose` blocks with the AI accent (DESIGN.md → The
  AI-Accent Rule), never a card in the tile; `MARKDOWN_COMPONENTS` stays module-level. The
  streaming badge lives in the tile's aside (`role="status"`); the interruption notice is a muted row with «Rigenera».
- **Conversazioni, Memoria and Preferenze are `ResponsiveModal`s** (`AssistantModals.tsx`, 2026-09-18 — two right-side
  `Sheet`s until then; Preferenze since 2026-11-12, a header popover before): `md`, `lg` and `sm`, eyebrow «Assistente
  · …», the title the act («Riprendi una conversazione», «Come risponde l'Assistente») or the companion tile's own name
  («Cosa sa di te», opening on the SAME `describeMemory` sentence the tile shows), no footer. Each takes
  `returnFocusTo`: the «⋯» copy that opened its menu (a menu item is gone when the modal opens), null from «Apri
  memoria» (the modal's own restore). The thread rows are flat and divided, the active one `aria-current` on `bg-muted`; their delete is
  `useArmedDelete` with `THREAD_DELETE_CONSEQUENCE` printed in the row in place of the preview and ONE live region
  for the list. They stay overlays for the reason the sheets were: the companion column must never become a second
  nested-scroll box.
- **The memory modal is two sub-tiles + an «Archiviati» disclosure**: the Attivi/Completati/Archiviati tabs are gone; a pending «goal
  reached» suggestion shows on its goal's row (the durable «Ignora» is `ignoreSuggestion`, the same mutation the tile above the
  conversation uses — two surfaces of ONE suggestion); the item delete is `useArmedDelete` (two clicks, no timer).
  `AssistantMemoryPanel` lost its collapsible variant (only the sheet renders it).
- **The guide is `AssistantComeFunziona`**, a Collapsible below the grid with three tiles («Come ti leggo», the web, the
  memory); the header has two buttons (2026-11-12): «⋯» (`DropdownMenu` of Conversazioni with its count, Memoria with
  its count, Preferenze; a bottom sheet below 769px) and ONE primary, «Nuova conversazione»; the description says the
  counts in words. Playwright locates: the verdict by `region` «Verdetto sul contesto», the tiles by their eyebrow
  («Conversazione» with `exact: true` — «Conversazione con l'assistente» is the live region), the rows by `list`
  «Domande suggerite», «⋯» by `button` «Altre azioni dell'assistente», the line by its text («Ho letto: …») and «cambia»
  by `button` «Cambia come ho letto la domanda», the disclosure by `button` «Come funziona»; there is no `tablist`.

## The visual direction

The whole page follows DESIGN.md § 5 → «AI Surfaces», concept B «La scena» (chosen by the owner on 2026-11-06 among three
drawn concepts, archived in `git log -- doc/ai/reference/`): **The AI-Accent Rule** (the accent on the «Assistente» sub-eyebrow of a model's message, on
proposal and question cards, and on the hover of «Invia messaggio», «Rileggi», «Rigenera», «Rispondi» and the suggestion rows;
never on the verdict, the companion column, the thread list, the «Ho letto» line or the user's messages), **The Question-Card Rule** (the
cards inside a message, ONE «Rispondi» under the last) and the paragraph «The Assistente page» (the conversation stays
still, the companion column's content slides when the reading changes). The code follows it since 2026-11: the companion slides with `sceneVariants`, the cards enter with `cardEnterVariants`.

## Registra (2026-11)

«Ho fatto spesa per 103 euro» becomes a card; «Conferma» writes the row in the browser through the expense form's
services, once. The mode is `register`, handled explicitly at every site of the WARNING in `types/assistant.ts`; its
protocol lives only in `buildRegisterPrompt`, never in `ASSISTANT_SYSTEM_CORE` (the emails read it); it never searches
the web. The rest — the four kinds, the questions, the card, the write, the outcome, its blind spots — in
doc/guide/assistente-registra.md.

## Composizione mobile

No composition, by design: the page's content is a conversation (DESIGN.md → The Conversation-Is-Content Rule), not a grid of tiles answering one question — below `desktop:` the conversation and its composer are the page and the companion tiles follow them in one column; nothing is closed, lifted or remembered (no `mobile-sections:` key). It is not one of the nineteen surfaces of `mobile:census`.

## Per-page blind spots

- **Assistente**: the analysis modes have no Playwright spec; the Cashflow tile is absent for a period without cashflow rows; the savings rate is `netCashFlow / (income + dividends)`, through `meaningfulSavingsRate` (none below −100% or without income: the words then say the deficit, 2026-11-12); «Patrimonio oggi» prints the GROSS total (the verdict's figure), the old card printed the net; the Conversazione count includes the user's messages; a suggestion writes the composer and sends nothing, follow-up rows act by their `action` (after a registration they prefill, «Registra un'altra» empties); a «Continua con» row is read afresh: «e questo mese?» under an analysis of October may be read as a question on today's data — «cambia» corrects it; the thread rows and the memory rows both use `useArmedDelete` (the threads' 3 s auto-disarm went on 2026-09-18, with the sheet); a companion taller than the viewport is reachable only at the end of the scroll (sticky, by design); the «goal reached» tile and the sheet's row are two surfaces of ONE suggestion.
- **The Assistant's cashflow figures changed on 2026-07-29 and again on 2026-10-20** (the Italian month bounds, «Entrate» with the coupons inside); saved threads are prose and are not regenerated (moved here from CLAUDE.md → Known Issues on 2026-09-18: it is this page's blind spot, not a cross-cutting one).
- **The portfolio block is TODAY's, whatever the period** (2026-10-20): the instruments, the allocation on the base, the ledger and the registers describe the portfolio at the time of the question; only the snapshot blocks and the cashflow are the period's. A question about a past month reads today's holdings beside that month's figures — the system core says so.
- **An answer saved before 2026-11-12 has no reading**: no «Ho letto» line and no «cambia» (a «cambia» needs the
  reading it changes); it keeps «Ricerca web usata», the tile's aside reads its mode's label, and its cards still follow
  its own `mode`.
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
- **A thread past 100 messages shows its LAST 100** (since 2026-11-16, `getAssistantThreadDetail` reads `orderBy createdAt desc, limit 100` and reverses the page; its oldest 100 until then): the page, the history replayed to the model and the router's previous turn all read the thread's end, and nothing before it.
- **Memory is the account's**: the owner and a co-owner share the categorisation rules; two wordings of one subject («palestra», «la palestra») stay two rules.
