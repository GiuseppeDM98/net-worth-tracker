# Assistente AI

> **Quando aprire questa guida** — chi tocca `app/dashboard/assistant/*`, `components/assistant/*`,
> `lib/server/assistant/*`, `lib/services/assistantMonthContextService.ts`,
> `lib/utils/{assistantNarrative,assistantPeriodOptions,expenseBreakdown,goalProposal}.ts`,
> `lib/hooks/useAssistantStreaming.ts`, `app/api/ai/assistant/*`, `app/api/goals/route.ts`. In
> `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file: `CLAUDE.md`
> → *Key Files* → le voci *Assistant*, *Assistant — obiettivi*, *Assistant — Goal-Based Investing*.
> Nessuna spec E2E permanente: entrambi i blocchi dichiarano «no Playwright spec» (le prove
> usa-e-getta sono state cancellate — vedi *Per-page blind spots*).

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
- **One aggregator, not two**: every cashflow figure comes from a single `buildCashflowBreakdown` call per builder, so
  `Σ expensesByCategory[].total === cashflow.totalExpenses` holds structurally. `transactionCount` **excludes
  transfers**, and a new required bundle field means updating ALL 4 builders (month/year/ytd/history).
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

### Streaming, threads, memory
- `deleteAssistantThread` must delete the `messages` subcollection in ≤400-doc batches first (no cascade in the Admin
  SDK). Never clear `streamingMessages` in a `useEffect([selectedThreadId])` — the SSE `meta` event sets the id
  mid-stream and wipes the buffer; post-stream invalidation uses a local `resolvedThreadId` updated from `meta`.
- **`max_tokens` budgets thinking AND text together** (chat 12000, chat+web 16000, structured 18000) — re-check whenever
  the data block grows. **Read `stop_reason` from the terminal `message_delta`** and append `TRUNCATION_NOTICE`: a limit
  either does not exist or announces itself.
- Memory: only `status === 'active'` items are injected; the fetch is `.catch(() => null)` and never blocks the stream;
  the Anthropic client is lazily imported (a module-level `new Anthropic()` breaks test environments). The context
  bundle lives in React state and is never persisted. `MARKDOWN_COMPONENTS` must be module-level or ReactMarkdown
  re-mounts on every chunk.
- **Do not use `DropdownMenu` for panels containing `Select` or `Switch`** — it closes on any click inside; use
  `Popover`. The mobile thread `Sheet` is controlled and must be closed explicitly in `onSelect`.
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
- **Carry the trajectory numbers, don't make the model compute them**: `requiredMonthlyContribution` and
  `projectedValueAtDeadline` ship with `assumedAnnualReturn` and are labelled **projections** — a required pace without
  its return assumption cannot be audited, and a model without them multiplies contribution × months, ignoring
  compounding. Present only for goals with BOTH a target and a deadline; absent otherwise, never zero.
- **THE PROPOSAL PROTOCOL: the AI never writes.** It emits ONE fenced ```goal-proposal block of pure JSON; the write
  happens only on the user's Conferma, through `POST /api/goals`. `lib/utils/goalProposal.ts` owns the ONE zod schema
  for both the block and the route body (client-safe, since the card validates before rendering). In zod 4 use
  **`z.partialRecord`** for `recommendedAllocation` — `z.record` with an enum key demands every key.
- **Intercept the block on `pre`, not on `code`** (a card inside `<pre>` is invalid nesting), and a malformed payload
  MUST fall through to a normal code block — the user still sees what the model wrote. `GoalProposalCard` reads owner,
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
  be confirmed); a follow-up submits directly.
- **Layout**: `PageContainer width="wide"`; verdict + `AssistantPeriodSelector` in `flex desktop:flex-row desktop:justify-between`;
  the grid is `desktop:grid-cols-[2fr_1fr] desktop:items-start`, the companion `desktop:sticky desktop:top-5 desktop:self-start`
  (sticky needs self-start, AGENTS.md § Tailwind Breakpoints) and it renders AFTER the composer on a phone; the composer stays
  `sticky bottom-0 max-desktop:portrait:bottom-20` inside the left column. The pill's strip bleeds `max-desktop:-mx-4
  max-desktop:px-4` (the page padding) and its tabs are 44px there. `TileGridSkeleton` with `cells={[]}` is the verdict's
  placeholder while a bundle loads.
- **Messages are flat** (`AssistantStreamingResponse`): the user's in a `bg-muted/40` sub-tile, the assistant's full-width prose;
  `GoalProposalCard` is a `not-prose` muted sub-tile (never a card in the tile); `MARKDOWN_COMPONENTS` stays module-level. The
  streaming badge lives in the tile's aside (`role="status"`); the interruption notice is a muted row with «Rigenera».
- **The memory sheet is two tiles + an «Archiviati» disclosure**: the Attivi/Completati/Archiviati tabs are gone; a pending «goal
  reached» suggestion shows on its goal's row (the durable «Ignora» is `ignoreSuggestion`, the same mutation the tile above the
  conversation uses — two surfaces of ONE suggestion); the item delete is `useArmedDelete` (two clicks, no timer).
  `AssistantMemoryPanel` lost its collapsible variant (only the sheet renders it).
- **The guide is `AssistantComeFunziona`**, a Collapsible below the grid with three tiles; the header has three icon actions and
  ONE primary; Conversazioni and Memoria wear their count as a dot AND the description says it in words (the dots were
  dropped once and asked back the same day). Playwright locates: the verdict by `region` «Verdetto sul
  contesto», the tiles by their eyebrow («Conversazione» with `exact: true` — «Conversazione con l'assistente» is the live
  region), the rows by `list` «Domande suggerite», the axis by `tablist` «Periodo di analisi», the disclosure by `button` «Come
  funziona».

## Per-page blind spots

- **Assistente**: no Playwright spec (the throwaway specs were deleted); the Cashflow tile is absent for a period without cashflow rows; the savings rate is `netCashFlow / (income + dividends)`; «Patrimonio oggi» prints the GROSS total (the verdict's figure), the old card printed the net; the Conversazione count includes the user's messages; starter rows prefill the composer, follow-up rows submit; the thread sheet keeps its 3 s auto-disarm delete (on request) while the memory rows use `useArmedDelete`; a companion taller than the viewport is reachable only at the end of the scroll (sticky, by design); the «goal reached» tile and the sheet's row are two surfaces of ONE suggestion.
