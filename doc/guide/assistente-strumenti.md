# Assistente — the tools on the data

> **When to open this guide** — whoever touches the tools the Assistente calls on the user's data:
> `lib/server/assistant/tools/*`, the pure queries `lib/utils/assistantExpenseQueries.ts`, the tool loop of
> `streamAssistantResponse` (`lib/server/assistant/anthropicStream.ts`), `TOOLS_SECTION` in
> `lib/server/assistant/prompts.ts`, the `computing` status. Split from doc/guide/assistente.md on 2026-11-26
> (DATI-09), past 500 lines; the page, the router and the stream stay there, the form of the answer in
> doc/guide/assistente-risposta.md, Registra in doc/guide/assistente-registra.md.

## Files

- Pure `lib/utils/assistantExpenseQueries.ts` (`totalsBy`, `comparePeriods`, `listRows`, `unknownNames`, `foldName`,
  `queryClockOf`; the caps `GROUPS_CAP` 60, `COMPARE_CAP` 40, `ROWS_CAP` 100).
- `lib/server/assistant/tools/`: `define.ts` (`defineAssistantTool`, `AssistantToolContext`, `AssistantToolError`,
  `UNREADABLE`), `registry.ts` (`ASSISTANT_TOOLS`, `ASSISTANT_TOOL_DEFINITIONS`, `runAssistantTool`; it re-exports
  `define.ts`), `filters.ts` (the day, the period, the filters by name), one file per tool (`cashflowTotals`,
  `cashflowCompare`, `cashflowRows`, `budgetState`, `costCentersState`), `context.ts` (`readAssistantTurnData`, the
  one read of a turn).
- Suites: `assistantExpenseQueries` (Rome and UTC), `assistantTools`, `anthropicStream` (§ the tool loop),
  `assistantRoutes`, `assistantPromptBundle`, `monthlyEmailService` (the email has no tools), `assistantChatNarrative`,
  and on the `dom` project `useAssistantStreaming`.

## The tools (2026-11-26, DATI-09)

- **Five tools, one registry** (contract C3): `cashflow_totali` (sums by category, subcategory, type, month or
  centre over any period), `cashflow_confronto` (two periods side by side), `cashflow_righe` (the rows behind a
  figure), `budget_stato` (the Budget page's measure for a year or a month), `centri_di_costo` (the centres as their
  page reads them). A tool is a `defineAssistantTool({ name, description, input, run })` in its own file: the zod
  schema is the one gate, the JSON schema sent to the model is generated from it (no `$schema` key, a `.describe()`
  in Italian on every property, no `strict`). **A later tool is ONE more entry of `ASSISTANT_TOOLS`**, never a
  change to the loop. The types live in `define.ts`, apart from `registry.ts`, so the tool modules and the registry
  form no import cycle.
- **`runAssistantTool` never throws**: an unknown tool, a refused input («Parametri non validi: …»), an
  `AssistantToolError` (an unknown name, with «Esistono: …» listing at most 40; a period ending before it starts;
  an unreadable budget or centres) are an `is_error` result the model can act on; any other throw is logged
  (`[assistant] tool X failed`) and answered «Lo strumento non ha risposto…».
- **The context is read ONCE per message**, before the first round (`readAssistantTurnData`): the whole recorded
  cashflow is the read the CASHFLOW 12 MESI block already makes, so the block and the tools share it; the centres
  and the budget are read beside it with `Promise.allSettled` — a failure of either is `UNREADABLE` for its tool
  alone, a failure of the expenses is the route's 500, as before. Registra reads none of it (`readCashflowBlockForPrompt`
  as before) and sends no tool. The account is the route's `body.userId` after `assertCanAccessAccount` — the
  owner's, also for a co-owner — never a tool input.
- **The cashflow rules are the app's**: the Italian day (`getItalyDateIso`), transfers never, spending positive,
  income the signed sum, groups keyed by id (`getCategoryKey`/`getSubCategoryKey`) and labelled through
  `resolveDisplayLabels`, a name filter folded (case and accents) and matched against the taxonomy AND the names
  written on the rows, `countsTowardBudget` only under `budgetOnly` and in `budget_stato`, the rows after today out
  unless `includeScheduled`, the history's floor (`cashflowHistoryStartYear`) applied with a `beforeFloorRows` count.
  `budget_stato` measures as the Budget page (`ceiling`, `ceilingToDate`, `scheduled`); `centri_di_costo` groups
  through `groupExpensesByCostCenter`, a refund in no figure, the centres off in settings → `{ enabled: false }`.
- **The loop** (`streamAssistantResponse` with a `toolContext`, every mode but Registra): `beta.messages.stream`
  + `finalMessage()`, each round a full request; the assistant turn pushed back whole (thinking blocks included),
  all the results of a round in ONE user message; a `max_tokens` or `refusal` turn runs no call; `pause_turn` is
  sent back as it is, three times at most. **The cap**: `ASSISTANT_TOOL_ROUNDS_MAX` = 8 rounds, or
  `ASSISTANT_TOOL_DEADLINE_MS` = 200 s from the first request (read when a request ENDS, against `maxDuration =
  300`); past either, the calls are answered «Limite di calcoli raggiunto…» as `is_error` for two closing requests,
  then the loop stops — with no text written the answer is «*Non sono riuscito a chiudere i conti…*». **ONE `tools`
  list per answer**: never changed between rounds (the thinking blocks are bound to it); no `tool_choice`
  (a 400 on Opus 5.5). Without a context the request is the single `create` of before.
- **The prompt**: `TOOLS_SECTION` («# Gli strumenti sui tuoi dati»), joined by `buildAssistantSystem` after
  `ANSWER_CONTRACT` — never in `ASSISTANT_SYSTEM_CORE`, which Registra and the emails read. Static: no date, no name.
- **The status**: `onStatus('computing')` before the tools run, `'writing'` again at the text that follows; the
  wait reads «Faccio i conti sui tuoi dati…» / «Controllo le cifre…» whatever the reading, and comes back under an
  answer already begun (as the web search's). The route logs `[assistant] tools: N calls, R rounds, S s` for every
  answer that could call them, zero included: the measure of the first weeks.

## Per-page blind spots

- **The tool results are not saved with the thread**: a follow-up asks again.
- **A renamed category filters by its current name and by the name still written on its old rows.**
- **The web search's `max_uses` is per request**: an answer of several rounds may search more than three times.
- **Between two tool rounds the model may write nothing**: the wait line is all the user sees.
- **The rows ahead are read up to twelve months** (the block's read): `includeScheduled` sees no further.
- **A request in flight is never cut by the deadline**: it is read when a request ends.
- **Prompt caching across the rounds is off**: each round re-sends the system and the data block; the log line is
  what a later change is measured against.
- **No history floor set → no floor** for the tools, as for the CASHFLOW block, while Cashflow › Analisi starts at
  `DEFAULT_HISTORY_START_YEAR`: on such an account a tool total may include years Analisi does not show.
- **The cap's count**: eight rounds run their tools, the next two requests get «stop» — eleven requests at most.
- **The figure is the code's, the words around it the model's** (the owner's tour, 2026-11-26: four answers right to
  the cent): the model may still paraphrase a window or a row's date loosely — «up to today» for a total that
  includes the rows still scheduled, a row's day read one off. The tool result is right; the prompt does not police it.
