# DATI-08 — Assistente: one form for every answer, the next questions written by the model, one question back as a card

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing (DATI-09, DATI-15, DATI-16 depend on it).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 8; decisions 18–22. Defines the shared
> contract **C4** (the answer's tail, index § 7).

## 1. The problem today (evidence on the code)

The owner pasted three answers of the Assistente (the cost of the daughters, two mortgages, the rise of the spending
against 2025) and called them not useful. Read against the code, each defect has a line:

1. **«I calcoli sono miei»; a refusal to add twelve months.** The system prompt forbids arithmetic: «Usa
   esclusivamente i numeri presenti nel blocco dati del messaggio; non calcolarli, stimarli o arrotondarli
   diversamente da come sono forniti» (`lib/server/assistant/prompts.ts:771`).
2. **Apologies and method talk.** «Distingui sempre fatto da inferenza… segnala che è una tua lettura» (`:773`) is
   obeyed as a preamble to every sentence.
3. **No source on a tax rule.** The web is «ESCLUSIVAMENTE per contestualizzare i movimenti di mercato» (`:777`); the
   per-request line «Non cercare informazioni macro esterne…» (`:941`, `:997`, `:1042`, `:1083`) is echoed back to the
   user; nothing in the prompt speaks of fiscal or legal terms.
4. **Fixed sections that do not fit the question.** Every period mode carries a three-section contract («In sintesi»,
   «Cosa ha mosso il patrimonio», «1-2 azioni o attenzioni», `:832-870` — «Trend storici principali» `:866`); nothing
   asks for one figure first, limits the length, forbids the names of the data blocks or a closing offer.
5. **Headings and lists arrive unstyled.** The answer is rendered inside `prose prose-sm …`
   (`components/assistant/AssistantStreamingResponse.tsx:245`) but `@tailwindcss/typography` is not installed, and
   `MARKDOWN_COMPONENTS` maps only `pre` and the table (`:124-145`): an `h2` is body text, a list has no bullets or
   numbers. The same in `components/performance/AIAnalysisDialog.tsx:396`.
6. **«Continua con» never reads the question.** The chips are a static table by mode
   (`lib/utils/assistantFollowUps.ts:32-112`, `buildFollowUpSuggestions` `:172-192`), built in
   `components/assistant/AssistantPageClient.tsx:279-288`.
7. **Questions back as prose, several at once.** The question card exists (`assistant-question`,
   `lib/utils/questionSet.ts:172`) but renders only on a registration
   (`AssistantStreamingResponse.tsx:256`, `lib/utils/assistantQuestionBlocks.ts:50-61`).
8. **The model.** `ASSISTANT_MODEL = 'claude-sonnet-5-5'` (`lib/constants/aiModels.ts:51`).
9. «Di' all'utente di nominarlo nella domanda» (`prompts.ts:514`): the answer tells the user how to ask.

## 2. Goal and acceptance criteria

Every answer opens with its verdict — one figure, or yes/no — then the sums that hold it, then at most two cautions;
the model may compute; a legal or fiscal statement carries its source; the next questions are the model's; a doubt
only the user can settle is ONE card with options.

1. The system prompt contains the form rule of § 4.1 and none of the sentences of § 1.1–1.4 and 1.9; it is still one
   static string (byte-identical for two requests of the same mode). Proof: P1, P2.
2. The period modes keep no fixed sections: one contract for every mode but Registra, plus one period line each.
   Proof: P3.
3. With the web off, the per-request line does not forbid anything: it says what to do when a fact is external.
   The router turns the web on for a fiscal, social-security or legal question. Proof: P4, R1.
4. An answer's headings, paragraphs, lists (bulleted and numbered), emphasis, links, quotes and rules are styled by
   explicit components, in the chat and in «Analizza con AI»; no `prose` class remains. Proof: D1.
5. The model closes a non-Registra answer with up to three next questions in a fenced `assistant-followups` block;
   the server removes the block from the saved text and stores them on the message; the chips are those, on the last
   answer only. The static table is deleted. Proof: U1–U3, S1, D2.
6. While the answer streams, the block is never visible, not even half-typed. Proof: U4, D3.
7. A non-Registra answer may carry ONE question card, answerable as on a registration; with a card on the last
   answer there are no chips. A second question block renders as nothing. Proof: U5, D4.
8. The Assistente runs on Opus 5.5 at effort `medium`, with the fallback and the web tool unchanged. Proof: A1.
9. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1, E2 green;
   `npm run perf:budget` `/dashboard/assistant` within 1 KB gz of `develop`.

## 3. Decisions

- **Decision 18** (owner, 2026-11-23): one rule for everything — verdict with one figure or yes/no, the sums, at most
  two cautions; no fixed sections, no jargon, no apologies; the model may compute.
- **Decision 19** (owner, 2026-11-23): «Continua con» is written by the assistant at the end of the answer.
- **Decision 20** (owner, 2026-11-23): at most one question back, as a card with options.
- **Decision 21** (owner, 2026-11-23): for a rule of law the assistant searches the web and cites the rule with its date.
- **Decision 22** (owner, 2026-11-23): the Assistente's model is Opus 5.5.
- Overturned: the three-section contracts of the period modes (2026-07/2026-10) and the static follow-ups (2026-11).
- Adopted, reversible:
  - (a) effort `medium` — Opus 5.5's own default; today's `high` was Sonnet 5.5's.
  - (b) the next questions travel as a fenced JSON array at the very end of the text, parsed by the server; a block
    that is not the last thing in the message, or is not valid, gives no chips.
  - (c) an answer saved before this spec shows no chips (it has none stored).
  - (d) Registra writes no next questions; its «Registra un'altra» chip after a written card stays.
  - (e) the type scale of the rendered Markdown (§ 4.5) uses the sizes the chat already has (14 px body, 15 px
    heading), no new token.
  - (f) the answers' style preference (`responseStyle`) stays, as one line of the user content.

## 4. Solution

### 4.1 The system prompt — `lib/server/assistant/prompts.ts`

In `ASSISTANT_SYSTEM_CORE` (`:753-823`), three replacements and one new section; every other line unchanged.

Section «# Regole sui dati (non negoziabili)» (`:770-774`) becomes:

```
# Regole sui dati (non negoziabili)
- I numeri vengono dai dati del messaggio e dagli strumenti che hai. Su quelli il conto è lavoro tuo: somma, sottrai, fai medie e percentuali ogni volta che la domanda lo chiede, e dai il risultato senza annunciarlo né scusartene
- Non scrivere mai una cifra che non discende da quei dati. Se un valore è indicato come N/D, dillo e non speculare su quale potrebbe essere
- Una causa che i dati non mostrano la dici una volta sola, con una parola («probabilmente»), senza premesse sul metodo
- Le variazioni di entrate e spese personali si spiegano solo con i dati forniti, mai con cause esterne inventate
```

Section «# Ricerca web (quando disponibile come strumento)» (`:776-778`) becomes:

```
# Ricerca web (quando disponibile come strumento)
Usala per due cose soltanto. Uno: contestualizzare i movimenti di mercato del patrimonio (banche centrali, eventi geopolitici, borse) con eventi e date verificabili. Due: ogni affermazione su una norma fiscale, previdenziale o legale italiana — detrazioni, deduzioni, aliquote, soglie, bonus, ISEE, successioni, limiti di deducibilità: cerca la fonte e cita la norma con l'anno a cui si applica («art. 15 TUIR, redditi 2026»), in una riga. Mai una soglia o un'aliquota a memoria: se non hai la ricerca o non trovi una fonte datata, dillo in mezza riga e dai il conto sui suoi dati lasciando la soglia come ipotesi dichiarata.
Non usarla mai per spiegare variazioni di entrate o spese personali dell'utente: quelle dipendono solo dai suoi dati.
Se la ricerca non trova nulla di datato, scrivi che non l'ha trovato: non scrivere mai che la ricerca web non era disponibile quando l'hai usata.
```

Section «# Stile e formattazione» (`:780-784`) is replaced by:

```
# Forma della risposta (vale per ogni domanda)
1. La prima riga è il verdetto: UNA cifra con unità e periodo, oppure sì o no. Niente premesse prima.
2. Poi i conti che lo reggono: le poche cifre da cui il verdetto discende, scritte come le controllerebbe chi rifà il conto («1.200 € × 12 = 14.400 €»). Un elenco o una tabella solo se le voci sono più di tre.
3. Infine al più due attenzioni, e solo se cambiano che cosa fare.
Lunghezza: quella che questi tre passi richiedono. Un titolo solo se la risposta supera una schermata, mai più di un livello.
Mai: i nomi dei blocchi dati («il blocco CASHFLOW»), il gergo dell'app, le scuse, «come richiesto», le istruzioni su come farti la domanda, le offerte finali («se vuoi posso…»).
Valute in formato italiano (1.234 €), percentuali con segno esplicito (+2,3% / −1,1%), grassetto solo sul verdetto.

# Le domande successive
Chiudi la risposta con un blocco di codice di linguaggio `assistant-followups` che contiene SOLO un array JSON di al più tre stringhe: le domande che l'utente farebbe adesso, scritte come le scriverebbe lui, ciascuna sotto i 90 caratteri, ciascuna rispondibile con i suoi dati. Niente testo dopo il blocco. Se non c'è una domanda successiva sensata, non scrivere il blocco.

# Una domanda a te serve davvero? Una sola, come scheda
Se la risposta cambia secondo un fatto che solo l'utente conosce (un familiare fiscalmente a carico, chi paga una rata, l'intenzione di vendere), rispondi comunque con l'ipotesi più probabile dichiarata in una riga e poi fai UNA domanda con un blocco di codice di linguaggio `assistant-question` che contiene SOLO un oggetto JSON: { "id": string, "kind": "single" | "multiple", "text": string, "why"?: string, "options": [ { "value": string, "label": string } ] (da 2 a 4), "allowOther": boolean }. Mai più di una, mai una domanda in prosa. Con la scheda non scrivere il blocco assistant-followups.
```

The «# Calibrazione del tono» section (`:786-790`) stays. The five per-mode contracts (`:832-875`) are replaced by one
constant and three period lines:

```ts
const ANSWER_CONTRACT = [
  '# Questa richiesta',
  "Vale la forma della risposta definita sopra: verdetto, conti, al più due attenzioni. Nessuna sezione fissa.",
].join('\n');

const PERIOD_LINES: Partial<Record<AssistantMode, string>> = {
  month_analysis: "È il giudizio su un mese: il verdetto è la variazione del patrimonio nel mese, i conti sono i tre o quattro movimenti che la spiegano.",
  year_analysis: "È il giudizio su un anno: il verdetto è la variazione del patrimonio nell'anno, i conti sono i tre o quattro movimenti che la spiegano; se l'anno è in corso, dillo nel verdetto.",
  ytd_analysis: "È l'andamento da inizio anno: il verdetto è la variazione fin qui; non annualizzare se non ti viene chiesto.",
  history_analysis: "È tutta la storia: il verdetto è di quanto è cresciuto il patrimonio e in quanti anni; privilegia il lungo periodo sul singolo mese.",
};

/** The static system of one mode: the core, the one contract and, for a period mode, its line. */
export function buildAssistantSystem(mode: AssistantMode): string {
  const line = PERIOD_LINES[mode];
  return [ASSISTANT_SYSTEM_CORE, ANSWER_CONTRACT, ...(line ? [line] : [])].join('\n\n');
}
```

Every `system: \`${ASSISTANT_SYSTEM_CORE}\n\n${…_FORMAT_CONTRACT}\`` (`:960`, `:1021`, `:1062`, `:1102`, `:1162`) becomes
`system: buildAssistantSystem('<mode>')`. Registra's system keeps its own contract (`REGISTER_CONTRACT`, `:1177`),
with one added line: «In questa modalità non scrivere il blocco assistant-followups.»

**The emails share the core** (`lib/server/monthlyEmailService.ts:742`: `ASSISTANT_SYSTEM_CORE` + the email
contract, `prompts.ts:903-918`): the email contract's first line «# Formato della risposta» becomes «# Formato della
risposta (questa è un'email: vale questo formato, non la forma della risposta definita sopra)», and it gains the
closing line «È un'email: non scrivere né il blocco assistant-followups né il blocco assistant-question.» As a net,
`generateEmailAiComment` (`monthlyEmailService.ts:851`) returns `splitAnswerTail(comment).body`. Nothing else of the
emails changes here (DATI-10).

Per-request lines: the four «Non cercare informazioni macro esterne…» (`:941`, `:997`, `:1042`, `:1083`) become one
constant `WEB_OFF_LINE = 'In questa richiesta non hai la ricerca web.'`; the two «non è richiesta una struttura fissa»
tails (`:1137`, `:1144`) are dropped; `:514` becomes «Non c'è un periodo: niente entrate, uscite, snapshot o confronto
tra date in questo blocco.» `buildResponseStyleInstruction` (`:739-743`) becomes:

```ts
export function buildResponseStyleInstruction(style: AssistantPreferences['responseStyle']): string {
  if (style === 'concise') return 'Preferenza dell’utente: il minimo — verdetto e conti, le attenzioni solo se gravi.';
  if (style === 'deep') return 'Preferenza dell’utente: più profondità — nei conti mostra anche i passaggi intermedi e le ipotesi.';
  return 'Preferenza dell’utente: risposta equilibrata.';
}
```

### 4.2 The router — `lib/server/assistant/router.ts`

`ASSISTANT_ROUTER_SYSTEM` (`:76-77`), the web paragraph becomes: «La ricerca web (webSearch): true se la risposta
richiede fatti esterni e recenti — mercati, tassi, inflazione, notizie, quotazioni — o tocca una norma fiscale,
previdenziale o legale (detrazioni, deduzioni, familiari a carico, aliquote, bonus, ISEE, successioni, mutui e
interessi detraibili), o se l'utente la chiede. Sempre false per register.»

### 4.3 The answer's tail — `lib/utils/assistantAnswerTail.ts` (new, written here) — contract C4

```ts
/**
 * The tail of an Assistente answer: the next questions, written by the model as a fenced JSON array
 * at the very end of its text (2026-11-23; until then a static table by mode that never read the
 * question). The server cuts the block off the text it saves and keeps the questions on the message;
 * the browser hides it while the answer streams.
 */
export const FOLLOW_UPS_LANGUAGE = 'assistant-followups';
export const FOLLOW_UPS_MAX = 3;
export const FOLLOW_UP_MAX_LENGTH = 90;

const FENCE = '```' + FOLLOW_UPS_LANGUAGE;
const TAIL = new RegExp('(?:^|\\n)```' + FOLLOW_UPS_LANGUAGE + '[ \\t]*\\n([\\s\\S]*?)\\n?```\\s*$');

/** The array as chips: strings only, trimmed, no blank, none over the length, no repeat, the first three. */
export function parseFollowUps(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const label = item.trim().replace(/\s+/g, ' ');
    if (label.length === 0 || label.length > FOLLOW_UP_MAX_LENGTH) continue;
    const key = label.toLocaleLowerCase('it-IT');
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(label);
    if (kept.length === FOLLOW_UPS_MAX) break;
  }
  return kept;
}

/**
 * What the reader may see of a text that is still arriving: everything before the tail's fence —
 * closed, open, or being typed (a last line that is a prefix of the fence, «``» or «```assist»).
 */
export function visibleAnswerText(content: string): string {
  const at = content.lastIndexOf(FENCE);
  if (at !== -1) return content.slice(0, at).trimEnd();
  const lastBreak = content.lastIndexOf('\n');
  const lastLine = content.slice(lastBreak + 1);
  if (lastLine.length >= 2 && FENCE.startsWith(lastLine)) return content.slice(0, Math.max(lastBreak, 0)).trimEnd();
  return content;
}

/** A finished answer as the text to save and its next questions. A tail that is not the last thing gives none. */
export function splitAnswerTail(text: string): { body: string; followUps: string[] } {
  const match = TAIL.exec(text);
  if (!match) return { body: visibleAnswerText(text), followUps: [] };
  return { body: text.slice(0, match.index).trimEnd(), followUps: parseFollowUps(match[1]) };
}
```

### 4.4 Server and store

- `types/assistant.ts` (`:79-95`): `AssistantMessage` gains `followUps?: string[]` («the next questions the model
  wrote; absent on a user message, on Registra and on every answer saved before 2026-11-23»).
- `app/api/ai/assistant/stream/route.ts` (`:421-460`): `const { body: answerBody, followUps } = selection.mode ===
  'register' ? { body: result.text, followUps: [] } : splitAnswerTail(result.text);` — `appendAssistantMessage` saves
  `content: answerBody` and `...(followUps.length ? { followUps } : {})`; `extractAndSaveMemory` and
  `lastMessagePreview` read `answerBody`; the `done` event gains `content: answerBody` and `followUps`.
- `lib/server/assistant/store.ts` (`:95`, `:375`): the field mapped both ways.
- `lib/hooks/useAssistantStreaming.ts` (`:331`): on `done` the message takes the event's `content` and `followUps`
  with its server id.
- `lib/constants/aiModels.ts:51`: `ASSISTANT_MODEL = 'claude-opus-5-5'`, comment «The conversational assistant
  (Opus 5.5 since 2026-11-23, owner's decision)».
- `lib/server/assistant/anthropicStream.ts` (`:249`): `output_config: { effort: 'medium' }`; the comment at `:214-232`
  gains one sentence («Opus 5.5 since 2026-11-23, at its default effort»). Nothing else in the request changes:
  adaptive thinking, the `server-side-fallback-2026-07-01` beta with `fallbacks: 'default'` and
  `web_search_20260209` are all accepted by Opus 5.5; no `tool_choice` is sent.

### 4.5 Client

- **Markdown** — new `components/ui/markdown-prose.tsx` exporting `MARKDOWN_PROSE_COMPONENTS` (module-level, stable):

  | Element | Classes |
  |---|---|
  | `h1`, `h2` | `mt-5 mb-2 text-[15px] font-semibold leading-snug text-foreground first:mt-0` |
  | `h3`, `h4` | `mt-4 mb-1.5 text-sm font-semibold text-foreground first:mt-0` |
  | `p` | `my-2 text-sm leading-[1.6] text-foreground first:mt-0 last:mb-0` |
  | `ul` | `my-2 list-disc space-y-1 pl-5 text-sm leading-[1.6] marker:text-muted-foreground` |
  | `ol` | `my-2 list-decimal space-y-1 pl-5 text-sm leading-[1.6] marker:font-mono marker:text-muted-foreground` |
  | `li` | `pl-1 [&>p]:my-0` |
  | `strong` | `font-semibold text-foreground` |
  | `a` | `underline underline-offset-2 hover:text-foreground` + `target="_blank" rel="noreferrer noopener"` |
  | `blockquote` | `my-3 border-l-2 border-border pl-3 text-muted-foreground` |
  | `hr` | `my-4 border-border` |
  | `code` (inline) | `rounded bg-muted px-1 py-0.5 font-mono text-[12px]` |

  plus today's table renderers moved here (`AssistantStreamingResponse.tsx:126-144`). `MARKDOWN_COMPONENTS` in the
  chat becomes `{ ...MARKDOWN_PROSE_COMPONENTS, pre: MarkdownPre }`; the wrapper at `:245` loses every `prose*` class
  (`max-w-none text-foreground` stays). `AIAnalysisDialog.tsx:396` uses the same components and loses `prose`.
- **Streaming** — `AssistantStreamingResponse.tsx:234`: the plain text shown while streaming is
  `visibleAnswerText(message.content)`.
- **Chips** — `AssistantPageClient.tsx:279-288`: `followUps` are, for a complete last assistant message, in order:
  `[REGISTER_ANOTHER_FOLLOW_UP]` when a card of it was written; `[]` when it holds a kept question block
  (`readAssistantQuestionBlocks(last.content).some((b) => b.kept && b.question)`); else `(last.followUps ??
  []).map((label, i) => ({ id: \`fu-${i}\`, label, prompt: label, action: 'send' }))`. `AssistantFollowUp` and
  `REGISTER_ANOTHER_FOLLOW_UP` move to `lib/utils/assistantAnswerTail.ts`; `lib/utils/assistantFollowUps.ts` and
  `__tests__/assistantFollowUps.test.ts` are deleted; the comment at `types/assistant.ts:9` loses its line.
- **The question card outside Registra** — `lib/utils/questionSet.ts`: `keepQuestionBlock(ordinal: number, mode:
  AssistantMode)` → `ordinal < (mode === 'register' ? ASSISTANT_QUESTION_MAX_PER_MESSAGE : 1)`;
  `readAssistantQuestionBlocks(content, mode)` passes it; `isAnswerableQuestionMessage` (`assistantQuestionBlocks.ts:50`)
  drops `message.mode === 'register'`; `AssistantStreamingResponse.tsx:256` reads the blocks for every mode. An entity
  question (`account:` …) outside Registra has no entity list to show: `entityQuestionProblems` gains the problem
  «domanda su un'entità fuori da una registrazione» when the mode is not `register`, and the block renders as nothing.

## 5. Constraints and traps

- **The system prompt is byte-identical** (`prompts.ts:745-751`; `__tests__/assistantPromptBundle.test.ts:596`, `:719`):
  here it means `buildAssistantSystem` takes the mode and NOTHING else — no date, no name, no preference.
- **Opus 5.5 refuses a forced `tool_choice`** (`aiModels.ts:59`): the router stays on Haiku 5.5; nothing here forces a
  tool.
- **Thinking blocks are bound to the conversation**: the history is replayed as text (`anthropicStream.ts:124-139`),
  so the model change needs no block handling.
- **`max_tokens` covers thinking and text** (`anthropicStream.ts:214-232`): unchanged budgets.
- **The silent-cap rule** (doc/guide/assistente.md): a truncated answer has no tail — `splitAnswerTail` then returns
  the visible text and no chips, and `TRUNCATION_NOTICE` stays.
- **A probe never opens a control that spends**: E1/E2 run on the fake stream (`e2e/assistantRegister.ts`
  `installFakeStream`); no automated step calls the model.
- **The AI-Accent Rule** (DESIGN.md): the rendered Markdown keeps the message's `data-generated`; the heading colour
  is the body's, not the accent.
- **The email prompts share `ASSISTANT_SYSTEM_CORE`**: here it means the two lines of § 4.1 and the tail stripped
  from the comment — P5 holds it; the six sections of the email stay until DATI-10.
- **No owner data**: the three cases of § 7 are run by the owner; the fixtures use «Asilo 300 €», «Mutuo A/B».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | the system of every mode contains «La prima riga è il verdetto» and «il conto è lavoro tuo»; none contains «non calcolarli», «ESCLUSIVAMENTE», «In sintesi», «Trend storici principali», «nominarlo nella domanda» | restore `:771` |
| P2 | unit · same | `buildAssistantSystem(mode)` twice → the same string; two users, two days → the same string | interpolate today's date |
| P3 | unit · same | month/year/ytd/history systems differ from chat's by exactly their period line; Registra's has «non scrivere il blocco assistant-followups» | reuse one line for all |
| P4 | unit · same | web off → the user content has `WEB_OFF_LINE` and not «Non cercare» | keep one old sentence |
| P5 | unit · `__tests__/monthlyEmailService.test.ts` | the email system ends with «non scrivere né il blocco assistant-followups né il blocco assistant-question»; a comment returned with a tail is saved without it | return the raw comment |
| R1 | unit · `__tests__/assistantRouter.test.ts` | the router system names «norma fiscale» and «familiari a carico» | drop the clause |
| U1 | unit · `__tests__/assistantAnswerTail.test.ts` | a text ending with the block → body without it, three questions | keep the block in the body |
| U2 | unit · same | five items, one repeated, one of 120 characters, one number → the valid first three; not an array → none; invalid JSON → none | no cap |
| U3 | unit · same | a block followed by more text → no chips, the body is the text before the fence | accept a block anywhere |
| U4 | unit · same | `visibleAnswerText`: «…\n``», «…\n```assist», an open fence with half an array → the text before; «…\n```python» → unchanged | hide only a closed block |
| U5 | unit · `__tests__/assistantQuestionBlocks.test.ts` | chat: the first block kept, the second not; register: two kept; an `account:` question in chat → a problem; a chat message is answerable when last and saved | keep two in chat |
| S1 | unit · `__tests__/assistantRoutes.test.ts` | a streamed answer with a tail → the saved `content` has no fence, `followUps` stored, the `done` event carries both; Registra → text untouched | save `result.text` |
| A1 | unit · `__tests__/anthropicStream.test.ts` | the request has `model: 'claude-opus-5-5'`, `output_config.effort: 'medium'`, `fallbacks: 'default'`, no `tool_choice` | effort `high` |
| D1 | dom · `__tests__/assistantStreamingResponse.test.tsx` | `## Titolo`, a bulleted and a numbered list render an `h2` with the heading classes, a `ul.list-disc`, an `ol.list-decimal`; no element has a `prose` class | drop the `ul` renderer |
| D2 | dom · `__tests__/assistantFollowUpChips.test.tsx` (new) | a last answer with `followUps` → those chips, a click submits the label; an older answer's are not shown; none stored → no «Continua con» | read the first message |
| D3 | dom · `__tests__/assistantStreamingResponse.test.tsx` | a streaming message whose content ends with a half-typed fence shows no backtick | render `message.content` |
| D4 | dom · `__tests__/assistantQuestionBlock.test.tsx` | a chat message with a question → the card, answerable; with it, no chips | chips beside the card |
| E1 | e2e · `e2e/assistant.spec.ts` | fake stream: an answer with a heading, a list and a tail → the list has bullets (computed `list-style-type: disc`), three chips, no fence text in the page; a click on a chip sends it | D1's mutation |
| E2 | e2e · `e2e/assistant.mobile.spec.ts` | the same at 390: chips at ≥ 44 px, no horizontal overflow | — (layout guard) |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the fake stream an answer shows a styled heading and list, no code fence, three
chips written for THAT answer; a question back is one card. On the real model (F): each of the owner's three
questions opens with one figure or sì/no, shows its sums, has at most two cautions, no «blocco», no «se vuoi posso»,
and the mortgage question cites its rule with a year.

- A — the diff, the old and new system prompts side by side. B–E by a throwaway Playwright script on the emulators
  with the fake stream, 1440 and 390: B a long answer (heading, numbered list, table) and its chips; C a streaming
  answer paused on a half-typed fence; D a question card in chat, answered → the reply is sent; E an old thread
  (planted, no `followUps`: «ornitorinco») → no chips; «Analizza con AI» in Rendimenti renders lists.
- F — at the owner's «pronto», on the mirror, with the real model (the only step that spends): the three questions
  of point 8 — the cost of the daughters, the two mortgages, the rise of the spending against last year — and one
  registration. Each is read against the expected outcome above; a miss is a prompt fix in this session.

## 8. Putting it into service

No rules, no index, no migration. Old messages keep their text and have no chips. The cost per answer roughly doubles
with the model (owner's decision 22). Measure: `perf:budget` `/dashboard/assistant`.

## 9. Documentation

- `doc/guide/assistente.md` — § «The form of an answer» (the rule, why arithmetic is allowed, the web's two uses),
  § «The answer's tail» (C4), § «A question back» (one card, any mode); the passages on the per-mode contracts and on
  the static follow-ups rewritten; § blind spots: an answer saved before 2026-11-23 has no chips; a tail that is not
  the last thing is dropped.
- `doc/guide/assistente-registra.md` — the question cap by mode.
- `doc/guide/rendimenti.md` — «Analizza con AI» renders through the shared components.
- `DESIGN.md` — amendment, before/after: generated Markdown is rendered by `components/ui/markdown-prose.tsx`, never
  by `prose` classes (the plugin is not installed).
- `AGENTS.md` § 3, Assistente stub — one sentence; § AI models — the Assistente on Opus 5.5.
- `CLAUDE.md` — Data & Integrations: «Opus 5.5 for the Assistente and the Consulente, Sonnet 5.5 for the emails'
  prose» (the emails move in DATI-10); Assistente line: «one form for every answer, next questions written by the
  model (2026-11)», under 20.000 characters.
- `README.md` — the Assistente feature lines. `Draft Release Temp.md` — «Assistente: risposte con la cifra in testa,
  conti visibili, domande successive scritte per la tua domanda, fonti sulle norme».
- `doc/dati/README.md` § 6 and § 7 (C4 as built).

## 10. Declared out of scope

- The data the model lacks to answer the three cases to the euro (categories over any period, single rows) → DATI-09.
- The ledger, the dividends and the net-worth history as tools → DATI-15.
- The emails' prompts and model → DATI-10.
- Showing the web sources as a list under the answer → doc/guide/assistente.md § blind spots (the citation is in the
  sentence).
- Prompt caching of the system prompt → not planned (the reason at `anthropicStream.ts:243-246` stands).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-08-assistente-forma-della-risposta.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C4 —, regole della serie)
- Leggi doc/guide/assistente.md, doc/guide/assistente-registra.md, doc/guide/server.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (The AI-Accent Rule, la tipografia) e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic: usa la skill claude-api prima di cambiare la richiesta al modello
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: il modulo della coda con U1–U4 (ognuno visto rosso
con la sua mutazione), il prompt di sistema e lo smistatore (P1–P4, R1), il server e lo store (S1, A1),
il rendering del Markdown (D1, D3), le schede «Continua con» e la domanda fuori da Registra (D2, D4,
U5), poi E1 ed E2 con lo stream finto. I testi del § 4.1 e il codice del § 4.3 sono già scritti:
copiali.

Fermati e chiedimi se: il prompt di sistema non è più una stringa statica dopo la modifica, un test
esistente sul prompt chiede una delle frasi tolte per una ragione che la spec non conosce, oppure una
verifica automatica chiamerebbe il modello vero.

Collaudo: § 7, la F al mio «pronto» (le tre domande del punto 8, sul modello vero). Un branch, un commit,
solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec that rewrites a shared contract (the system prompt, the message
shape) across server, store and UI. Estimated size: L (one new module, one new component file, ~12 files touched,
~18 tests).
