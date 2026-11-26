# Assistente — la forma della risposta

> **When to open this guide** — whoever touches the form of an Assistente answer: `ANSWER_CONTRACT`,
> `buildAssistantSystem` and the core's data, web and style rules in `lib/server/assistant/prompts.ts`, the tail
> (`lib/utils/assistantAnswerTail.ts`, its cut in `app/api/ai/assistant/stream/route.ts`), the chips of
> `AssistantPageClient`, the question cap of `lib/utils/{questionSet,assistantQuestionBlocks}.ts` and the renderers of
> generated Markdown (`components/ui/markdown-prose.tsx`). Split from doc/guide/assistente.md on 2026-11-25;
> the page, the router and the stream stay there, Registra in doc/guide/assistente-registra.md.

## Files

- `lib/server/assistant/prompts.ts` (`ANSWER_CONTRACT`, `PERIOD_LINES`, `buildAssistantSystem`, `WEB_OFF_LINE`), `lib/server/assistant/router.ts` (the web for a rule of law), pure `lib/utils/assistantAnswerTail.ts`, `components/ui/markdown-prose.tsx`, `components/assistant/{AssistantStreamingResponse,AssistantPageClient}.tsx`.
- Suites: `assistantAnswerTail`, `streamFollow`, `assistantPromptBundle`, `assistantRouter`, `assistantRoutes`, `anthropicStream`, `assistantQuestionBlocks`, `questionSet`, `markdownProseClasses` (no `prose` class in a source string, 2026-11-26), and on the `dom` project `assistantStreamingResponse`, `assistantQuestionBlock`, `assistantCompanionScene`; E2E `e2e/assistant.chat.spec.ts` › E6, E8–E10 (the slow stream), E11 (the new conversation) and `e2e/assistant.chat.mobile.spec.ts` › E7 (the fake stream with `followUps`).

## The form of an answer (2026-11-25)
- **ONE form for every mode but Registra**: `ANSWER_CONTRACT` (`prompts.ts`), which `buildAssistantSystem(mode)`
  appends to `ASSISTANT_SYSTEM_CORE` with the mode's period line (`PERIOD_LINES`: month, year, ytd, history; the chat
  has none). The first line is the verdict — ONE figure with its unit and period, or sì/no —; then the sums that hold
  it, written to be checked («1.200 € × 12 = 14.400 €»), a list or a table only past three items; then at most two
  cautions, only if they change the verdict's figure. No closing offers («se vuoi posso…»), bold on the first line's
  figure or sì/no alone — never on a label («Ipotesi:»), a table's totals or a list's titles (tightened in phase F of
  2026-11-25, owner: the spec's «Grassetto solo sul verdetto» left all three bold) —, a heading only past one screen.
  A section the question needs beyond the three steps (an allowance received beside the cost it offsets) is welcome:
  the owner kept it. The five per-mode format contracts (and their «In sintesi», «Trend storici
  principali» sections) are gone. The emails keep their six sections (`buildEmailPeriodicFormatContract`).
- **The form is NEVER in the core**: `ASSISTANT_SYSTEM_CORE` is read by Registra and by the emails
  (`buildEmailAiPrompt`), which must meet neither the form, nor the tail, nor the one-question rule. Pinned by
  `assistantPromptBundle` › «leaves the form out of Registra and the emails» (their systems hold «il conto è lavoro tuo» and none of the form).
- **`buildAssistantSystem` takes the mode and NOTHING else** (`assistantPromptBundle` › «is the same string twice, for two users on two days»).
- **Arithmetic is the model's job** (the core's «Regole sui dati», rewritten): on the numbers of the message and of its
  tools it adds, subtracts, averages and gives the result without announcing it. Until 2026-11-25 the core said «non
  calcolarli» and the answers refused the sums the owner asked for. What it may not write is a figure that does not
  follow from the data.
- **The web has two uses** (the core's «Ricerca web»): the market context of the net worth, and every claim on an
  Italian fiscal, pension or legal rule, cited with its year in one line («art. 15 TUIR, redditi 2026»). Never a
  threshold from memory: without the search, «da verificare» beside it and the sum on its data. The router turns the
  web on for a question on a rule of law (`router.ts`; `assistantRouter` › «turns the web on for a rule of law»). An analysis with the macro preference off carries
  `WEB_OFF_LINE` («In questa richiesta non hai la ricerca web.»), which forbids nothing. The sources are cited in the
  sentence, never listed under the answer.
- **The model**: Opus 5.5 at its default effort `medium` (`ASSISTANT_MODEL`, owner's decision of 2026-11-23), the same
  request otherwise: adaptive thinking, the server-side fallback, `web_search_20260209`, no `tool_choice` (Opus 5.5
  refuses a forced one: the router stays on Haiku 5.5). Pinned by `anthropicStream` › «runs on Opus 5.5 at effort medium».

## The answer's tail (2026-11-25)
- **«Continua con» is written by the model for THAT answer**: the answer ends with a ```assistant-followups block holding
  ONLY a JSON array of at most three questions (`lib/utils/assistantAnswerTail.ts`: `FOLLOW_UPS_MAX`, under
  `FOLLOW_UP_MAX_LENGTH` = 90 characters, no repeat, strings only — `parseFollowUps`). The curated, static follow-ups
  (`assistantFollowUps.ts`) are deleted.
- **The server cuts it** (`splitAnswerTail` in `stream/route.ts`): the saved `content` never holds the block,
  `followUps` is stored on the message (`store.ts` maps it both ways) and the `done` event carries both. The block
  gives chips only when it is the LAST thing in the text; one followed by more text is cut and gives none; one left
  open (a cut at the token limit) goes from its fence on. Registra's text is saved as it came.
- **The client never shows it**: while streaming the answer is already Markdown (`StreamingMarkdown`, the text
  deferred with `useDeferredValue`, owner's phase F of 2026-11-25: the plain text turned into Markdown at the end and
  the page jumped), cut by `streamingAnswerText` — `visibleAnswerText` (a fence half typed, ``` or ```assist, is
  hidden until it proves to be another language), stopped at the first fenced block, so a card's JSON never shows
  and the cards render at `done`; an answer that never got its `done` (interrupted, or ended on an error) keeps its
  `local-` id and renders `visibleAnswerText`.
- **The page follows a streaming answer only while the reader stays at its end** (phase F, 2026-11-25: every chunk
  scrolled the page back down): a scroll up of the layout's `main` stops the following, a scroll down that shows the
  conversation's end starts it again (`nextStreamFollow`, `lib/utils/streamFollow.ts`). Only a message the reader
  SENDS (the count of user messages, never the whole count, which changes when the buffer gives way to the saved
  thread) or opening a thread starts it again; every automatic scroll, the one after `done` included, waits on it
  (the owner's second report: the start and the end of the stream still pulled the page down). The scroll is
  `block: 'nearest'` on the end anchor, whose `scroll-mb-36` (`scroll-mb-56` on a phone in portrait) clears the
  sticky composer. E2E `e2e/assistant.chat.spec.ts` › E8 (a slow stream faked in the page) and E9 (a scroll up as
  the stream starts holds through `done`).
- **A new conversation reads its saved thread while the answer streams** (the id arrives with `meta`): the tile's
  skeleton shows only while the thread has nothing to show yet, or it flashed in place of the question and mounted
  the messages again (owner, phase F of 2026-11-25; E10). That read never restarts the following: only opening a
  thread does, outside a stream. The remount had also hidden a Registra card mounting before the page's reads: the
  card now waits for them (`readsLoading`, doc/guide/assistente-registra.md § The card).
- **«Nuova conversazione» brings the page back to the top** (`handleNewThread` scrolls the layout's `main`; owner,
  phase F of 2026-11-25; E11 in a low window, where the empty page still scrolls). On `done` the message takes the
  event's `content` and `followUps` (`useAssistantStreaming`); a `done` without `content` leaves the streamed text.
- **The chips** (`answerFollowUps`, `AssistantPageClient`): under the last complete answer only; none beside a question
  card that renders (`isValidQuestionBlock`); a Registra answer has its three starters, prefilling
  (`REGISTER_STARTER_FOLLOW_UPS`), led by «Registra un'altra» after a written card; any other answer its stored
  questions, which SEND (`action: 'send'`, no route: the router reads each like a typed message).

## A question back (2026-11-25)
- **A doubt only the reader can settle is ONE card, in any mode**: the answer states the likeliest hypothesis in a
  line, then writes ONE ```assistant-question block (the contract's third section); with it, no tail.
  `keepQuestionBlock(ordinal, mode)`: two blocks on a registration, the first alone elsewhere; outside Registra a
  question on an entity (`account:`, `member:` …) is not kept — there is no list to show —, and a block not kept
  renders as nothing. `isAnswerableQuestionMessage` no longer reads the mode.
- **The reply goes as Registra's does**, with the asking message's route (`askingRoute`, `routeCarried: true`); a
  message with no reading (an explicit mode) gives the route of its own `mode` and period (`modeToRoute`), so the
  router never reads the reply from scratch. Registra's reads (`useRegisterReads`) stay off outside Registra.

## Blind spots — what the guided tour of the answer's form showed (2026-11-25/26, the real model on the mirror)
- **Bold strays beyond the rule**: on section labels, a figure inside a list, the cautions' first words, sometimes
  the whole first sentence. The table totals did lose it after the tightening. The owner accepted it as it is: not a
  bug to chase with the prompt.
- **Categories across two periods**: asked «rispetto all'anno scorso», the model set the previous calendar year beside
  the last twelve months and subtracted. The differences are right, the columns are neither period. The cashflow
  block has no category totals for an arbitrary window: the cashflow tools' comparison of two periods (`comparePeriods`, planned) closes it.
- **A rule with its year may stay hedged** («1 o 2 anni, da verificare») although the web search ran, and the router
  can ask for the web on a question the cashflow alone answers. The model's choices, not the form's.
- **A question back works across turns**: one card, then the reply carried with its route, then a new message read
  by the router on another mode — every answer kept the form and its own next questions. Registra asked two cards in
  one message (its cap) and «Conferma» wrote one row.
