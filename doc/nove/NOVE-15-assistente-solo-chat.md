# NOVE-15 — The Assistente as only a chat: write, the router reads, «Ho letto: … · cambia»

> Series `doc/nove/` (README.md § 5): **depends on NOVE-14** (the router: `AssistantRouteReading`, the `route` event,
> the `route` override, `mode: 'auto'`; README.md § 7); **NOVE-16 is implemented after it**, and the costume pass
> (NOVE-19 → NOVE-20, the Assistente in NOVE-20) dresses the page this spec leaves. Written on 2026-11-12; every `file:line` is cited on
> `develop` @ b841cbd7 and moves with NOVE-14's diff. Executes the owner's point 6 and decisions 11, 12, 15
> (README.md § 3).

## 1. The problem today (evidence on the code)

The owner: «ci sono troppi tasti a vista da cliccare […] Mi piacerebbe che l'assistente fosse solo una chat dove io
scrivo e lui in automatico capisce cosa deve fare». At rest, on an empty chat at 1440, the page shows **24
controls** (counted on b841cbd7):

| Where | Controls | Evidence |
| --- | --- | --- |
| Header | 5 — Conversazioni, Memoria, Preferenze, «Registra un movimento», «Nuova conversazione» | `AssistantHeader.tsx:91-156` |
| The axis | 6 — five tabs of «Periodo di analisi» and the month `Select` | `AssistantPeriodSelector.tsx:28-34,100-146` |
| Starter rows | 8 — «Domande suggerite» | `lib/constants/assistantPrompts.ts`, `AssistantPageClient.tsx:382-392` |
| Composer | 2 — the textarea and «Invia messaggio» | `AssistantComposer.tsx:70-81` |
| Below | 3 — «Apri memoria» (`tiles/MemoriaTile.tsx:69-86`), the Consulente link, «Come funziona» | `AssistantPageClient.tsx:753-758` |

- The page owns the mode: `useState<AssistantMode>('month_analysis')` (`AssistantPageClient.tsx:137`), with a month,
  a year and a chat context beside it (:138-146), sent as is (`lib/hooks/useAssistantStreaming.ts:40-69`).
- Registra is a mode the user ENTERS: the header pencil or `?mode=registra` (`AssistantPageClient.tsx:459-469`,
  :528-538), a strip with «Torna all'analisi» in place of the axis (:654-666), one thread per Italian day derived in
  render (:177-185), «Nuova conversazione» off inside it (`AssistantHeader.tsx:50-55,148-156`).
- The cards are gated by the PAGE's mode: an expense block is a card only when `mode === 'register'`
  (`AssistantStreamingResponse.tsx:101`, the `mode` handed down at :230-236) and the questions likewise (:237-241) —
  a register message opened while the page is in another mode renders as code.
- The thread survives a Back from Cashflow only through `?mode=registra` and the day's thread
  (`doc/guide/assistente.md:410-422`; `e2e/assistant.register.spec.ts:289-310`).
- «Come funziona» lists «I cinque periodi» and says that in «Libera», with «Contesto macro» on, «la ricerca è sempre
  abilitata» (`AssistantComeFunziona.tsx:9-15,60-62`) — the code ignores the preference in chat
  (`lib/server/assistant/webSearchPolicy.ts:96-100`).

## 2. Goal and acceptance criteria

**Goal**: the page is a conversation and a composer. The user writes; every message goes as `mode: 'auto'`; under
each answer one line says how it was read, with «cambia» to read it again. The header holds «Nuova conversazione» and
«⋯»; an empty chat offers four written suggestions; the cards follow the message, not the page.

1. Controls at rest on an empty chat at 1440: **11** — «Nuova conversazione», «⋯», four suggestions, the textarea,
   «Invia messaggio», «Apri memoria», the Consulente link, «Come funziona» (from 24). **Proof**: E1.
2. No period axis, no Registra strip, no «Torna all'analisi», no control named «Registra un movimento» (the register
   verdict's headline «Registra un movimento.», `buildRegisterVerdict`, stays after a registration).
   **Proof**: E1, P1.
3. Every send (composer, suggestion, follow-up, question answer, Rigenera, «Rileggi») is `mode: 'auto'` with no
   `month`, `year`, `chatContext`. **Proof**: U1.
4. Under every assistant message with a `routeReading`, once it is complete: «Ho letto: <reading>» (or «Hai scelto: …»,
   «Non ne sono sicuro: l'ho letta come …»), « · con ricerca web» when the web was used, then « · cambia» on the LAST
   assistant message only, never while streaming, never in demo. Older messages without a reading show no line and
   keep «Ricerca web usata». **Proof**: N1, S2.
5. «cambia» opens the chooser; «Rileggi» re-sends the last user prompt as a new turn with `route` = the chosen
   reading; the previous answer stays. **Proof**: S3, E2.
6. An empty chat shows four suggestions built from what the account holds (§ 4 table) — four skeleton rows while
   the overview is loading, so no row changes under the pointer; pressing one writes it in the composer, moves the
   focus there with the caret at the end, and sends nothing. **Proof**: N2, P2, E3.
7. The header: «Nuova conversazione» (off only in demo and while streaming) and the «⋯» menu with «Conversazioni
   (N)», «Memoria (N)», «Preferenze»; each opens its modal and the focus comes back to «⋯» at close (to «Apri memoria» when the
   tile's button opened Memoria). **Proof**: H1, H2, E4.
8. An ```expense-proposal or ```assistant-question block is a card when ITS message has `mode: 'register'`, on any
   page state; a block on a chat message is code. **Proof**: S1, Q1.
9. `?mode=registra` opens an empty chat with the register suggestions first and the composer focused, and drops the
   param; the open thread lives in `?thread=<id>`, so a reload and the browser's Back reopen it. **Proof**: P3, P4, E5.
10. A thread saved before this spec opens as it was: each message renders by its own `mode`. **Proof**: S1, E5.
11. `/dashboard/assistant` stays under its 754 KB gz ceiling (`perf/budget.json:23-25`) with no raise. **Proof**:
    `npm run perf:budget`.

## 3. Decisions

- **Owner 11 (2026-11-12)**: the router in front of the pipeline (NOVE-14); the line «Ho letto: … · cambia».
- **Owner 12 (2026-11-12)**: written suggestions on an empty chat replace the Mese/Anno/YTD/Storico selector;
  pressing one writes the message.
- **Owner 15 (2026-11-12)**: in sight only «Nuova conversazione» and «⋯» (Conversazioni, Memoria, Preferenze); the
  «Registra» button goes; the router recognises a written expense.
- **Adopted, reversible**:
  - Preferenze becomes a modal (`ResponsiveModal` sm) opened from «⋯»: a `DropdownMenu` cannot hold its `Select`
    and `Switch` (`doc/guide/assistente.md:179-180`); the controls and labels are today's popover's, except the «Contesto macro» hint
    («Abilita ricerca web nelle analisi e in chat.», false for the chat), which says what the code does: «Cerca sul
    web in ogni analisi di periodo.»; the popover's own heading «Preferenze» goes (the modal's title replaces it);
  - «cambia» only on the last assistant message; «Rileggi» adds a new turn, it never rewrites history;
  - the chooser asks two things — what («Una domanda», «Un'analisi», «Un movimento da registrare») and on which
    period — plus «Cerca anche sul web»; an analysis has no «Oggi»;
- **Owner 52 (2026-11-12)**: a «Continua con» row is a NEW question: it is sent as `'auto'` with no `route` and the
  router reads it — it does not inherit the answer's reading. Declared (assistente.md § Per-page blind spots): «una
  riga di «Continua con» è letta da capo: «e questo mese?» sotto un'analisi di ottobre può essere letta come una
  domanda sui dati di oggi; «cambia» la corregge».
- **Owner 53 (2026-11-12)**: the two turns that DO inherit a reading — an answer to a question card and «Rigenera» —
  send it with `routeCarried: true` (NOVE-14's contract): their line reads «Ho letto: …»; «Hai scelto: …» is
  written only after «cambia» → «Rileggi».
- **Owner 36 (2026-11-12)**: the old words «Fisse/Variabili/Debiti» leave the AI prompts here (§ 4 › Sentences
  outside the page).
- **Adopted, reversible (continued)**:
  - an answer to an ```assistant-question card and «Rigenera» re-send the asking/interrupted turn's reading as
    `route` with `routeCarried: true`: a registration in progress never depends on a second reading. «Rigenera» carries the reading the
    interrupted turn's `route` event brought, unless it was a fallback (the router then reads again); an answer on a
    thread saved before this spec (a `register` message with no reading) is sent as Registra;
  - while the router reads, the turn keeps the mode of the answer before it (or of the route passed): the companion
    never slides to a free question and back;
  - after «Rileggi» the focus goes to the composer's «Interrompi risposta» (the textarea is disabled while the turn
    streams and «cambia» is unmounted): the one action that turn offers, where the composer is;
  - the «Conversazione» tile's aside is the last answer's reading (`describeRoute`, capitalised: «Analisi di ottobre
    2026»); on an answer without a reading, today's `getActivePeriodLabel` fed by the thread's pins; none on an
    empty chat;
  - the today block of the chat's user content stops telling the model to ask for a period «selected in the
    context» — there is none: it says to name it in the question or to use «cambia»;
  - the open thread is in the URL (`?thread=<id>`, written with `window.history.replaceState` as
    `ConsulenteBook.tsx:205` does): it replaces the day's register thread as what survives a Back;
  - the header title is «Una frase, una risposta»; the composer's placeholder «Chiedi del tuo patrimonio o scrivi
    una spesa…»;
  - the thread title rule is unchanged (`store.ts:52-63`): a conversation that opens with a registration is still
    «Registrazioni · 12 nov 2026», no longer one per day;
  - the «Ho letto» line replaces the «Ricerca web usata» badge on routed messages;
  - «Come funziona»'s first tile becomes «Come ti leggo» and its web tile says what the code does.
- **Overturned (2026-11-12)**: Registra's one thread per Italian day and «Nuova conversazione» off in Registra
  (2026-11-11, `doc/guide/assistente.md:410-422`) — there is no mode left to be in.

## 4. Solution

### `lib/utils/assistantChatNarrative.ts` (new, pure; every sentence of the chat)

```ts
import { MONTH_NAMES } from '@/lib/constants/months';
import type { AssistantRouteOverride, AssistantRouteReading } from '@/types/assistant';
import type { DashboardOverviewPayload } from '@/types/dashboardOverview';

export const EMPTY_CHAT_QUESTION = 'Cosa vuoi sapere, o cosa vuoi registrare?';
export const CHAT_COMPOSER_PLACEHOLDER = 'Chiedi del tuo patrimonio o scrivi una spesa…';
export const CHANGE_READING_LABEL = 'cambia';
export const CHANGE_READING_ARIA = 'Cambia come ho letto la domanda';
export const EMPTY_CHAT_SUGGESTIONS_MAX = 4;
const CATEGORY_IN_SENTENCE_MAX = 40;

const monthName = (month: number) => MONTH_NAMES[month - 1].toLowerCase();

/** «analisi di ottobre 2026», «domanda libera, sui dati di oggi», «un movimento da registrare». */
export function describeRoute({ intent, period }: AssistantRouteOverride): string {
  if (intent === 'register') return 'un movimento da registrare';
  if (intent === 'month_analysis' && period.kind === 'month') {
    return `analisi di ${monthName(period.month)} ${period.year}`;
  }
  if (intent === 'year_analysis' && period.kind === 'year') return `analisi del ${period.year}`;
  if (intent === 'ytd_analysis') return 'analisi da inizio anno';
  if (intent === 'history_analysis') return 'analisi di tutto lo storico';
  if (period.kind === 'month') return `domanda su ${monthName(period.month)} ${period.year}`;
  if (period.kind === 'year') return `domanda sul ${period.year}`;
  if (period.kind === 'ytd') return "domanda sull'andamento da inizio anno";
  if (period.kind === 'history') return 'domanda su tutto lo storico';
  return 'domanda libera, sui dati di oggi';
}

/** The line under an answer, without « · cambia» (a button the component appends). */
export function describeReadingLine(reading: AssistantRouteReading, webSearchUsed: boolean | undefined): string {
  const what = describeRoute(reading.route);
  const head = reading.source === 'fallback' ? `Non ne sono sicuro: l'ho letta come ${what}`
    : reading.source === 'override' ? `Hai scelto: ${what}` : `Ho letto: ${what}`; // 'router' and 'carried'
  return (webSearchUsed ?? reading.route.webSearch) ? `${head} · con ricerca web` : head;
}

export interface EmptyChatSuggestion { id: string; label: string; text: string; register: boolean }
export type EmptyChatState = 'unknown' | 'nothing' | 'assets-only' | 'cashflow';

const SPENT: EmptyChatSuggestion = { id: 'spent', label: 'Oggi ho speso…', text: 'Oggi ho speso ', register: true };
const SALARY: EmptyChatSuggestion = { id: 'salary', label: 'Ho ricevuto lo stipendio di…',
  text: 'Ho ricevuto lo stipendio di ', register: true };
const MOVED: EmptyChatSuggestion = { id: 'moved', label: 'Ho spostato…', text: 'Ho spostato ', register: true };
const ask = (id: string, text: string): EmptyChatSuggestion => ({ id, label: text, text, register: false });

export function readEmptyChatState(overview: DashboardOverviewPayload | null | undefined): EmptyChatState {
  if (!overview) return 'unknown';
  const stats = overview.expenseStats;
  const moved = stats ? [stats.currentMonth, stats.previousMonth].some((m) => m.income !== 0 || m.expenses !== 0)
    : false;
  if (moved) return 'cashflow';
  return overview.flags.assetCount > 0 ? 'assets-only' : 'nothing';
}

/** Four rows for an empty chat, from what the account holds; `registerFirst` for `?mode=registra`. */
export function buildEmptyChatSuggestions(input: { overview: DashboardOverviewPayload | null | undefined;
  today: { year: number; month: number }; registerFirst: boolean }): EmptyChatSuggestion[] {
  const previousMonth = input.today.month === 1 ? 12 : input.today.month - 1;
  const lastMonth = ask('last-month', `Com'è andato ${monthName(previousMonth)}?`);
  const ytd = ask('ytd', 'Come sto andando da inizio anno?');
  const growth = ask('history', 'Come sono cresciuto negli anni?');
  const top = input.overview?.expenseStats?.topExpenseCategories[0]?.category;
  const byState: Record<EmptyChatState, EmptyChatSuggestion[]> = {
    unknown: [lastMonth, ytd, growth, SPENT],
    nothing: [ask('start', 'Da dove comincio a tenere traccia del patrimonio?'), SPENT, SALARY,
      ask('skills', 'Cosa sai fare per me?')],
    'assets-only': [ask('composition', "Com'è composto il mio patrimonio oggi?"),
      ask('allocation', "Sono allineato all'allocazione obiettivo?"), growth, SPENT],
    cashflow: [lastMonth, top && top.length <= CATEGORY_IN_SENTENCE_MAX
      ? ask('top-category', `Quanto ho speso in ${top} questo mese?`)
      : ask('where', 'Dove sono andati i soldi questo mese?'), ytd, SPENT],
  };
  const rows = byState[readEmptyChatState(input.overview)];
  if (!input.registerFirst) return rows.slice(0, EMPTY_CHAT_SUGGESTIONS_MAX);
  const firstQuestion = rows.find((row) => !row.register) ?? lastMonth;
  return [SPENT, SALARY, MOVED, firstQuestion];
}
```

`describeConversation` (`lib/utils/assistantNarrative.ts:566-593`): its empty branch (:585) becomes
`[prose(`${question} Scegli un suggerimento o scrivi qui sotto.`)]`, the page passing `EMPTY_CHAT_QUESTION`; the
`mode` passed is the display mode (below). `buildNoContextVerdict`'s fallback sentence (:316-323) becomes
«L'assistente risponde sui dati di oggi; nomina un periodo nella domanda per ragionare sui suoi numeri.».

### `lib/utils/assistantRoute.ts` (NOVE-14's module) — the chooser's two pure functions

```ts
export type RouteChooserKind = 'question' | 'analysis' | 'register';
export interface RouteChooserDraft { kind: RouteChooserKind; period: AssistantRoutePeriod['kind'];
  month: AssistantMonthSelectorValue; year: number; webSearch: boolean }

export function routeToChooserDraft(route: AssistantRouteOverride, today: Today): RouteChooserDraft {
  const { intent, period } = route;
  const previous = today.month === 1 ? { year: today.year - 1, month: 12 }
    : { year: today.year, month: today.month - 1 };
  return {
    kind: intent === 'register' ? 'register' : intent === 'chat' ? 'question' : 'analysis',
    period: period.kind,
    month: period.kind === 'month' ? { year: period.year, month: period.month } : previous,
    year: period.kind === 'year' ? period.year : today.year,
    webSearch: route.webSearch,
  };
}

/** Null for an analysis without a period: «Rileggi» stays off. */
export function chooserDraftToOverride(draft: RouteChooserDraft): AssistantRouteOverride | null {
  if (draft.kind === 'register') return { intent: 'register', period: { kind: 'none' }, webSearch: false };
  const period: AssistantRoutePeriod = draft.period === 'month' ? { kind: 'month', ...draft.month }
    : draft.period === 'year' ? { kind: 'year', year: draft.year } : { kind: draft.period };
  if (draft.kind === 'question') return { intent: 'chat', period, webSearch: draft.webSearch };
  const intent = ({ month: 'month_analysis', year: 'year_analysis', ytd: 'ytd_analysis', history: 'history_analysis',
    none: null } as const)[draft.period];
  return intent ? { intent, period, webSearch: draft.webSearch } : null;
}
```

### `lib/hooks/useAssistantStreaming.ts`

- The args lose `mode`, `selectedMonth`, `selectedYear`, `chatContextType`; `buildStreamRequestBody` (:40-69) sends
  `{ userId, mode: 'auto', prompt, threadId, preferences, ...(route ? { route } : {}) }`.
- `submit(prompt?: string, options?: { route?: AssistantRouteOverride })`; the two placeholders (:228-279) are born
  with `monthContext: null` and `mode` = `routeToSelection(options.route).mode` with a route, else the mode of the last
  assistant message of the list they are appended to (`'chat'` when it has none): the display mode never passes
  through `'chat'` while the router reads (up to 4 s).
- A `route` event (in `forEachSseEvent`'s handler, :307-363): the user placeholder takes `mode:
  routeToSelection(reading.route).mode`, the assistant slot the same `mode` and `routeReading: reading`.
- `lastSentPromptRef` (:182) becomes `lastSentRef: { prompt: string; route?: AssistantRouteOverride }`, set at
  submit with the route passed; the `route` event sets `lastSentRef.current.route` to `reading.route` without
  `confidence` when `reading.source !== 'fallback'`. `retry` (:389-393) re-sends `submit(prompt, { route })`.

### Components

- **`AssistantHeader.tsx`** — props lose `memory`, `loadingMemory`, `isPreferencesPending`, `onPreferencesChange`,
  `onEnterRegister`, `isRegister`; gain `onOpenPreferences` and `moreTriggerRef: React.RefObject<HTMLButtonElement |
  null>`. Title «Una frase, una riga»/«Un periodo, una risposta» (:87) → «Una frase, una risposta». The actions:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="h-11 w-11 desktop:h-9 desktop:w-9"
      aria-label="Altre azioni dell'assistente"
      // PageHeader renders the actions twice (PageHeader.tsx:56-57,83): the copy used records itself.
      onPointerDown={(event) => { moreTriggerRef.current = event.currentTarget; }}
      onFocus={(event) => { moreTriggerRef.current = event.currentTarget; }}>
      <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-60">
    <DropdownMenuItem disabled={isDemo} onSelect={onOpenThreads}>
      <MessagesSquare className="size-4" aria-hidden="true" />{threadsLabel}
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={onOpenMemory}>
      <Brain className="size-4" aria-hidden="true" />
      {activeMemoryCount > 0 ? `Memoria (${activeMemoryCount})` : 'Memoria'}
    </DropdownMenuItem>
    <DropdownMenuItem disabled={isDemo} onSelect={onOpenPreferences}>
      <Settings2 className="size-4" aria-hidden="true" />Preferenze
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
<Button onClick={onNewThread} disabled={isDemo || isStreaming} aria-label={newThreadLabel(isDemo)}
  className="h-11 w-11 p-0 desktop:h-9 desktop:w-auto desktop:px-4">
  <Plus className="h-4 w-4" aria-hidden="true" /><span className="hidden desktop:inline">Nuova conversazione</span>
</Button>
```

  `threadsLabel` is today's text (:96-102): «Conversazioni (12)», «Conversazioni (più di 50)», «Conversazioni —
  non disponibili in modalità demo». `newThreadLabel(isDemo)` keeps its demo branch and loses the Registra one;
  `CountDot` is deleted (the description already says the counts in words, `describeAssistantHeader`). The menu is
  the shell's own pattern (`SecondaryMenuDrawer.tsx:278-337`: a `DropdownMenuItem` whose `onSelect` opens a modal)
  and a bottom sheet below 769px (`components/ui/dropdown-menu.tsx:44-64`).
- **`AssistantPreferencesPopover.tsx` → `AssistantPreferencesFields.tsx`**: the `PopoverContent` body (:50-121)
  without the `Popover`, trigger or width; `AssistantModals.tsx` adds a third modal: `width="sm"`, eyebrow
  «Assistente · Preferenze», title «Come risponde l'Assistente», reading «Le scelte valgono per ogni conversazione e
  si salvano da sole.», body `AssistantPreferencesFields`. All three modals get `returnFocusTo={modalReturnRef}`, a
  page ref (`useRef<HTMLElement | null>(null)`): each «⋯» item's handler sets `modalReturnRef.current =
  moreTriggerRef.current` before opening its modal; «Apri memoria» in the tile sets it to `null`, so the modal's own
  restore (`responsive-modal.tsx:178`: `returnFocusTo?.current ?? openerRef.current`) brings the focus back to «Apri
  memoria». `AssistantModals` gains `isPreferencesOpen`, `onPreferencesOpenChange`, `onPreferencesChange`,
  `isPreferencesPending`, `returnFocusTo`.
- **`AssistantStreamingResponse.tsx`**: the `mode` prop (:36-37, :160) goes. `MessageIdProvider mode={message.mode}`
  (:232); `MessageQuestionsProvider blocks={message.mode === 'register' ? readAssistantQuestionBlocks(message.content)
  : NO_QUESTION_BLOCKS}` (:237-241, its comment «The PAGE's mode» rewritten «the MESSAGE's mode»). New props
  `changeableMessageId: string | undefined` and `onChangeReading: (message: AssistantMessage, opener: HTMLElement) =>
  void`. Under a complete assistant message with `routeReading`, in place of the badge (:259-264):

```tsx
{!isUser && !isActiveStream && message.routeReading && (
  <p className="mt-2 text-[12px] leading-[1.45] text-muted-foreground">
    {describeReadingLine(message.routeReading, message.webSearchUsed)}
    {message.id === changeableMessageId && (
      <>
        {' · '}
        <button type="button" aria-label={CHANGE_READING_ARIA}
          onClick={(event) => onChangeReading(message, event.currentTarget)}
          className="inline-flex min-h-11 items-center rounded font-medium text-foreground underline
            underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:min-h-0">
          {CHANGE_READING_LABEL}
        </button>
      </>
    )}
  </p>
)}
```

  A message without `routeReading` keeps the badge as today.
- **`AssistantRouteChooser.tsx`** (new; props `{ open: boolean; reading: AssistantRouteReading | null; today: {
  year: number; month: number }; onReread: (route: AssistantRouteOverride) => void; onClose: () => void;
  returnFocusTo: React.RefObject<HTMLElement | null> }`): `ResponsiveModal` `width="sm"`, eyebrow «Assistente · Lettura», title «Come
  devo leggerla?», reading «La rileggo come scegli qui: la risposta nuova arriva sotto, quella di prima resta.». Body,
  a draft from `routeToChooserDraft(reading.route, today)`:
  - `ChoiceList` single, label «Cosa mi chiedi»: «Una domanda» («Rispondo a quello che chiedi»), «Un'analisi» («Il
    giudizio su tutto il periodo»), «Un movimento da registrare» («Te lo propongo come riga: la scrivi tu con
    Conferma»);
  - unless register, `ChoiceList` single, label «Su quale periodo»: «Oggi» («Il patrimonio di oggi, senza un
    periodo»; absent for an analysis — choosing «Un'analisi» on «Oggi» moves the period to «Un mese»), «Un mese» (and
    under the group `AssistantMonthPicker`, «Mese di riferimento», on `buildMonthOptions()` plus the draft's month
    appended when it is older than the options), «Un anno» (a `Select` «Anno di riferimento» on `buildYearOptions()`
    plus the draft's year appended when it is older) — the router reads any month from 2000-01, the options go three
    and four years back —, «Da inizio anno», «Tutto lo storico»;
  - unless register, a `Switch` «Cerca anche sul web», hint «Per mercati, tassi e notizie».
  Footer: «Annulla» (outline) and «Rileggi» (primary, `AI_CONTROL_ACCENT_CLASS`: it asks a model; disabled when
  `chooserDraftToOverride` is null). «Rileggi» → `onReread(route)` — the page's is `(route) =>
  streaming.submit(lastUserPrompt, { route })`, `lastUserPrompt` the content of the last `user` message of
  `renderedMessages` —, the modal closed with the focus sent to the composer's «Interrompi risposta» button (a ref on
  it, focused in a `requestAnimationFrame` after the submit; the textarea is disabled while streaming);
  «Annulla»/Esc → the focus back to the «cambia» that opened it (`returnFocusTo` a ref the page sets from `opener`).
- **`AssistantConversazioneTile.tsx`**: loses `mode`; `periodLabel: string | null` — null on an empty chat; the
  last assistant message's `describeRoute(routeReading.route)` with its first letter capitalised; on a last
  assistant message without a reading `getActivePeriodLabel(displayMode, pinnedMonth, pinnedYear)` with the thread's
  pins (the function stays, its tests too). `promptRows` are the suggestions (`{ id, label, primary: index === 0 }`);
  while the overview is loading (`overviewData === undefined && !overviewError`) the list is four `Skeleton` rows
  (`h-11 rounded-xl`, `aria-hidden`) in its place, `ariaLabel` «Domande suggerite» kept (Playwright locates it,
  `doc/guide/assistente.md:298-303`); the «Registra» comment at :146 goes; it forwards the two new props.
- **`AssistantComposer.tsx`**: the placeholder is `CHAT_COMPOSER_PLACEHOLDER`; `errorHint` is no longer passed.
- **`AssistantComeFunziona.tsx`**: `PERIODS` (:9-15) → `READINGS`, tile eyebrow «Come ti leggo», reading «Scrivi come
  parleresti: capisco io se è una domanda, un'analisi o un movimento, e su quale periodo.»; rows «Domanda» («Una
  domanda aperta: sui dati di oggi, o sul periodo che nomini»), «Analisi» («Il giudizio su un mese, un anno, da inizio
  anno o tutto lo storico»), «Movimento» («Una spesa, un'entrata o uno spostamento: te lo propongo come riga»),
  «cambia» («Sotto ogni risposta: rileggo la domanda come scegli tu»). The web tile's paragraph (:60-63): «Cerco sul
  web quando la domanda chiede fatti di fuori — mercati, tassi, inflazione, notizie — o quando lo chiedi; nelle analisi
  anche quando è attivo <Contesto macro> delle Preferenze. Mai per un movimento da registrare.». The trigger line
  (:33-35): «Come leggo i messaggi, la ricerca web e la memoria — su quali numeri rispondo».

### `AssistantPageClient.tsx`

- **Removed**: `mode`, `selectedMonth`, `selectedYear`, `chatContextType`, `registerDayIso` (:137-147, :184), the
  thread-sync effect (:292-314), `isAnalysisBlocked` and `composerErrorHint` (:334-344, :519-521), `promptRows`
  (:381-392), `handleModeChange`, the month/year/context handlers, `handlePromptSelect`, `enterRegister`,
  `leaveRegister` (:395-435, :457-478), the `?mode=registra` effect (:525-538), the strip and the axis (:654-684).
- **Display mode**: `const displayMode = renderedMessages.findLast((m) => m.role === 'assistant')?.mode ??
  threadDetail?.thread.mode ?? 'chat'`; `previewMode = displayMode`, the pins from the thread as today (:228-233);
  the scene (:152-155) settles on `displayMode`; `isRegister = displayMode === 'register'` keeps choosing the
  register verdict and `RegistraContestoTile` (:350, :569-570).
- **`selectedThreadId = pickedThreadId`** (no derived day thread); `pickedThreadId` starts from
  `searchParams.get('thread') ?? undefined`; `onThreadIdResolved` and `handleSelectThread` write `?thread=<id>`,
  `handleNewThread` removes it — `window.history.replaceState(null, '', url)`.
- **The register reads**: `useRegisterReads(ownerId, needsRegisterReads && !isDemo)` with `needsRegisterReads =
  renderedMessages.some((m) => m.role === 'assistant' && m.mode === 'register') || registerPrefetch`;
  `registerPrefetch` turns true when a register suggestion is picked or on `?mode=registra`.
- **Suggestions**: `buildEmptyChatSuggestions({ overview: overviewError ? null : overviewData, today, registerFirst
  })`; `handleSuggestionSelect(row)` → `setDraft(row.text)`, focus the composer and put the caret at the end
  (`setSelectionRange(len, len)` in a `requestAnimationFrame`), `setRegisterPrefetch(row.register || prev)`.
- **`?mode=registra`** (`CashflowPageClient.tsx:271`, `ExpenseTrackingTab.tsx:974` keep linking it): read once at
  mount into `registerFirst` and `registerPrefetch` (`useState(() => searchParams.get('mode') === 'registra')`); one
  effect, under today's gates (`!loadingThreads && !isDemo && assistantConfigured`, :535 — before them the composer
  is not mounted) and a handled ref, drops the param with `window.history.replaceState` and focuses the composer,
  deferred with `setTimeout(…, 0)`.
- **Answers and follow-ups**: `submitAnswer={(text) => streaming.submit(text, { route: askingRoute, routeCarried: true })}`
  (`useAssistantStreaming`'s `submit` options gain `routeCarried?: boolean`, posted beside `route`; `retry`
  posts `routeCarried: true` with the reading it re-sends; «Rileggi» posts the chooser's route WITHOUT it); a
  «Continua con» row is `streaming.submit(text)`, no route (decision 52); `askingRoute`
  the last assistant message's `routeReading.route` without `confidence`, and on a message with no reading whose
  `mode === 'register'` (a thread saved before this spec) `{ intent: 'register', period: { kind: 'none' }, webSearch:
  false }` — a question card renders only on a register message; `handleFollowUpSelect`'s default action
  (:484) reads `last.mode === 'register'` instead of the page's.
- **`changeableMessageId`**: the last assistant message's id when `!isStreaming && !isDemo` and it has a
  `routeReading`.

### Deleted (dead after the page)

`AssistantPeriodSelector.tsx`; `lib/constants/assistantPrompts.ts` and `AssistantPromptChip` (`types/assistant.ts:48-
55`); from `assistantPeriodOptions.ts`: `getPreviousCompletedMonth`, `resolveAssistantPreviewMode`,
`buildComposerPlaceholder`, `buildEmptyStateQuestion`, `findRegisterThread`, `findThreadForPeriod` go with their
tests in `__tests__/assistantPeriodOptions.test.ts`; `buildMonthOptions` and `buildYearOptions` (the chooser reads
them), `getActivePeriodLabel` (the tile's aside on an answer without a reading), `getModeBadgeLabel`,
`ASSISTANT_PROMPT_MAX_LENGTH` and `describePromptLength` stay. The WARNING checklist (`types/assistant.ts:1-14`) drops
the deleted names and `AssistantPeriodSelector.tsx`, and gains «`lib/utils/assistantChatNarrative.ts`
(`describeRoute`) and `lib/utils/assistantRoute.ts` (`routeToChooserDraft`, `chooserDraftToOverride`)».

### Sentences outside the page

- `lib/server/assistant/prompts.ts:844` (`buildEmailPeriodicFormatContract`, the periodic email's comment — not
  a chat mode): «commenta il mix per tipo (Fisse/Variabili/Debiti)» becomes «commenta il mix per tipo (Spese
  Necessarie/Spese Non Necessarie/Debiti)», the labels the data block already prints (`EXPENSE_TYPE_LABELS`); the
  comment at `:515` reads «the Necessarie/Non necessarie/Debiti mix» (decision 36). No test pins the old words
  (`grep -rn "Fisse/Variabili" __tests__` is empty today); the chat modes' `system` stays byte-identical.
- `lib/server/assistant/prompts.ts`, `formatTodayContextForPrompt` (:460; the chat's USER content, never `system`):
  «Non c'è un periodo: niente entrate, uscite, snapshot o confronto tra date. Se la domanda riguarda un periodo, di'
  all'utente di nominarlo nella domanda (per esempio «a ottobre») o di usare «cambia» sotto la risposta; non stimare
  quelle cifre.» The per-mode `system` is untouched: `__tests__/assistantPromptBundle.test.ts` (:680, :737, :756,
  :773, :822, :838, :864) and `__tests__/anthropicStream.test.ts:207` green unedited.
- `components/settings/tabs/GeneraleTab.tsx:797-802`: «Si modificano dall'Assistente, nel menu «⋯» → Preferenze.»;
  `lib/utils/settingsNarrative.ts:249`: «Preferenze non ancora sincronizzate: si leggono e modificano
  dall'Assistente, nel menu «⋯» → Preferenze.» (`__tests__/settingsNarrative.test.ts:289` follows).

### Persisted conversations and the URL

No migration. A thread opens as stored; each message renders by its own `mode` (criterion 10); the old day threads
are ordinary conversations in «Conversazioni», with their «Registra» badge (`getModeBadgeLabel`). Old messages have no
`routeReading`: no line, no «cambia» (a «cambia» needs the reading it changes). Params: `?mode=registra` accepted and
dropped; `?thread=<id>` new; an unknown or foreign id is the thread read's failed state (today's `queryError` alert,
`AssistantPageClient.tsx:583-588`) and «Nuova conversazione» leaves it.

### Keyboard and focus

- Tab at rest: «⋯», «Nuova conversazione», the four rows, the textarea, «Invia messaggio», then the companion.
- «⋯»: Enter, Space or ArrowDown opens; arrows move; Enter picks; Esc closes back on «⋯» (Radix). A picked item
  opens its modal (focus inside, `ResponsiveModal`); its close returns to «⋯» through `modalReturnRef` — a menu item
  is unmounted when the modal opens, so the default restore would land on `body` (CLAUDE.md § Known Issues).
- A suggestion: the composer gets the focus with the caret at the end; Enter sends it.
- «cambia»: a button in the line; the chooser's first radio takes the focus; «Rileggi» → «Interrompi risposta» in
  the composer; «Annulla» or Esc → back on «cambia».

### The phone (390) and the budgets

The page is not composed and not one of `mobile:census`'s surfaces (`doc/guide/assistente.md:442-444`; AGENTS.md §
Commands: the census surfaces are `navigation.ts` minus the assistant): `mobile:census` and `mobile:budget` do not
read it and are not run for it. At 390 the header is two 44px targets, the «⋯» menu is a bottom sheet, the three
modals and the chooser are sheets, «cambia» is a 44px target inside a wrapping line; E6 pins it. `perf:budget`: the
selector, the popover's shell and the chips leave the chunk, the chooser enters (`ChoiceList`, `Select`, `Switch` are
already in it); `DropdownMenu` is the shell's. The ceiling (754) is not raised.

### `DESIGN.md` amendments (decision 16; applied to the letter)

- **Line 579**, BEFORE: «… «Rivedi il report», «Registra», «Rigenera», «Rispondi», …» — AFTER: «… «Rivedi il
  report», «Rileggi», «Rigenera», «Rispondi», …».
- **Line 579**, BEFORE: «… «Salta le domande», «Torna all'analisi», a link that only opens the Assistente («Chiedi
  all'Assistente»); …» — AFTER: «… «Salta le domande», «cambia» (it only opens the choice), a link that only opens
  the Assistente («Chiedi all'Assistente»); …».
- **Line 1048**, BEFORE: «… Analisi's `AnalisiPeriodControls`, the Assistente's `AssistantPeriodSelector`,
  Previdenza's fiscal year (`PensionOverview`), …» — AFTER: «… Analisi's `AnalisiPeriodControls`, Previdenza's fiscal
  year (`PensionOverview`), …».
- **Line 593**, BEFORE (the whole paragraph): «**The Assistente page** (AI Surfaces, 2026-11-01). The conversation is
  the page (The Conversation-Is-Content Rule): the «Conversazione» tile and, from `desktop:`, the companion column at
  `desktop:grid-cols-[2fr_1fr]`. A change of mode — a period of «Periodo di analisi», Registra — keeps the
  conversation still and slides the companion column's content as a screen of the Consulente slides; question and
  proposal cards enter with the question card's motion. In Registra the axis gives way to the strip «Registra ·
  l'Assistente conosce categorie, conti e le ultime righe» with «Torna all'analisi»; before the first message the
  companion shows the register summary computed in the browser (the cash accounts with their balance and the two
  defaults, the number of categories, the features on); the thread is «Registrazioni · 1 nov 2026», one per Italian
  day. The composer holds 4000 characters and shows its counter from 3800. The verdict, the companion, the thread
  list («Conversazioni») and the composer take no accent beyond the hover of «Invia messaggio», of «Registra», of
  «Rigenera» and of the suggestion rows.»
  AFTER: «**The Assistente page** (AI Surfaces, 2026-11-01; only a chat since 2026-11-12). The conversation is the
  page (The Conversation-Is-Content Rule): the «Conversazione» tile and, from `desktop:`, the companion column at
  `desktop:grid-cols-[2fr_1fr]`. There is no period axis and no mode to enter: the user writes, a router reads
  intent, period and web search, and under each answer one line says how — «Ho letto: analisi di ottobre 2026 ·
  cambia», «cambia» on the last answer only, opening the choice of how to read it again. The header holds «Nuova
  conversazione» and a «⋯» menu (Conversazioni, Memoria, Preferenze), nothing else. An empty chat offers four written
  suggestions built from what the account holds; pressing one writes it in the composer and sends nothing. When the
  reading changes — a registration after an analysis — the conversation stays still and the companion column's
  content slides as a screen of the Consulente slides; question and proposal cards enter with the question card's
  motion, and a block is a card on a message read as a registration, whatever came before. After a registration the
  companion shows the register summary (the cash accounts with their balance and the two defaults, the number of
  categories, the features on). The composer holds 4000 characters and shows its counter from 3800. The verdict, the
  companion, the thread list («Conversazioni»), the «Ho letto» line and the composer take no accent beyond the hover
  of «Invia messaggio», of «Rileggi», of «Rigenera» and of the suggestion rows.»

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **«Do not use `DropdownMenu` for panels containing `Select` or `Switch`»** (`doc/guide/assistente.md:179-180`): here
  Preferenze leaves the menu for a modal; the menu holds three plain items.
- **A `ResponsiveModal` opener that never held the focus** (CLAUDE.md § Known Issues): here every modal opened from
  «⋯» and the chooser pass `returnFocusTo`; the trigger records itself on `pointerdown` AND `focus` (Safari focuses no
  clicked button).
- **`react-hooks/set-state-in-effect`** (AGENTS.md § React Compiler): the display mode, `selectedThreadId` and the
  suggestions are DERIVED in render; the only effect is the `?mode=registra` one, deferred with `setTimeout(…, 0)` as
  today's (:534-538). `__tests__/reactCompilerCoverage.test.ts` stays green: no `try/finally`, no ref passed to a
  function called in render (the caret is set in the handler).
- **The streaming buffer is never cleared in an effect on `selectedThreadId`** (`useAssistantStreaming.ts:141-144`):
  the `?thread` write happens in `onThreadIdResolved`, never as an effect that resets.
- **The AI-Accent Rule** (`DESIGN.md:579`): «Rileggi» asks a model and takes the hover accent; «cambia», «⋯»,
  «Nuova conversazione» and the line do not; the line is not model text (no `data-generated`).
- **Sentences live in `*Narrative.ts`**: every new string of § 4 is in `assistantChatNarrative.ts` or in a component
  label listed here; nothing is concatenated in JSX beyond « · ».
- **No owner data**: the suggestion that names a category reads it from the payload at runtime; tests and this spec
  use invented ones («Spesa», «Viaggi»).
- **A probe never spends** (README.md § 8): every E2E fakes the stream (`installFakeStream`); P-tests mock the hook's
  `fetch`.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| N1 | `assistantChatNarrative.test.ts`: `describeRoute` for the ten readings (the four analyses on their period, register, chat on each of the five periods; exact strings); `describeReadingLine` for router, carried («Ho letto: …»), override («Hai scelto: …»), fallback, web from `webSearchUsed` over the reading | `toLowerCase()` dropped |
| N2 | `buildEmptyChatSuggestions`: the four states' exact labels; `registerFirst` order; a 40-character category → «Quanto ho speso in <it> questo mese?», a 41-character one → «Dove sono andati i soldi questo mese?»; January → «dicembre» | the `top.length <= CATEGORY_IN_SENTENCE_MAX` guard dropped |
| N3 | `assistantRoute.test.ts`: `chooserDraftToOverride(routeToChooserDraft(r))` equals `r` for the ten readings, each with `webSearch` true and false (register always false); analysis + `none` → null | `none: null` → `'chat'` |
| N4 | `assistantNarrative.test.ts:330-338` rewritten: `buildNoContextVerdict(null)` reads «L'assistente risponde sui dati di oggi; nomina un periodo nella domanda per ragionare sui suoi numeri.»; `:511-516` rewritten: the empty branch with `EMPTY_CHAT_QUESTION` reads «Cosa vuoi sapere, o cosa vuoi registrare? Scegli un suggerimento o scrivi qui sotto.» | the old sentence back |
| N5 | `assistantPromptBundle.test.ts`: the today block `toContain('nominarlo nella domanda')` and not «selezionarlo» | the old sentence |
| U1 | `useAssistantStreaming.test.tsx`: the body is `mode: 'auto'` without period fields; `route` when passed; a `route` event sets the slot's `mode` and `routeReading`; `retry` re-sends a route passed; an `'auto'` send whose stream emits a `router` reading then an `error` → `retry` posts that reading as `route`, with a `fallback` reading it posts none; after a `register` answer the next placeholders are born `register` | keep `chatContext` in the body; the `route` handler leaves the ref alone; born `'chat'` |
| H1 | `assistantHeader.test.tsx` (rewritten): two buttons per header copy; the menu's three items with counts; «Nuova conversazione» off in demo and while streaming only; no «Registra un movimento» | `disabled={isDemo \|\| isStreaming}` → `disabled={isDemo}` |
| H2 | `assistantCompanionScene.test.tsx`: the «⋯» → «Memoria» modal, Esc → focus on «⋯»; «⋯» focused once, then «Apri memoria» → Esc → focus on «Apri memoria» | drop `returnFocusTo`; `returnFocusTo={moreTriggerRef}` |
| S1 | `assistantStreamingResponse.test.tsx:104` rewritten: an expense block on a `register` message is a card, on a `chat` message code, in one list | gate on a constant `'chat'` |
| S2 | the line: «Ho letto: analisi di ottobre 2026 · cambia» on the last; no «cambia» on the earlier one nor with `changeableMessageId` undefined; no line on a message without reading, which keeps «Ricerca web usata» | `changeableMessageId` ignored |
| S3 | `assistantRouteChooser.test.tsx`: from «domanda su ottobre 2026», pick «Un movimento da registrare» → the period group and the switch disappear; «Rileggi» calls `onReread` with the register override; «Un'analisi» hides «Oggi»; a reading of 2020-03 shows «Marzo 2020» in the month picker | keep «Oggi» for an analysis; the options without the draft's month |
| Q1 | `assistantQuestionBlock.test.tsx:197` rewritten: gated by the message's mode | read the page's |
| P1 | `assistantCompanionScene.test.tsx` rewritten (the page test: its mock of `AssistantPreferencesPopover` becomes one of `AssistantPreferencesFields`; P2-P5 and Q2 are in it): the scene slides when a faked `route` event turns the last message to `register`; in a conversation whose last answer is `register` a second send keeps `[data-scene="register"]` mounted until its `route` event; no `tablist`, no «Torna all'analisi» | settle the scene on a constant; placeholders born `'chat'` |
| P2 | a suggestion fills the composer, focuses it, no `fetch`; with the overview pending the list is four skeletons and no button | call `submit`; render the `unknown` rows while loading |
| P3 | `?mode=registra`, rendered with `loadingThreads` true then false → register rows first, composer focused, `replaceState` without the param | keep the param; run the effect at mount |
| P4 | `?thread=t1` opens t1; a `meta` of a new thread writes `?thread=`; «Nuova conversazione» removes it; no «cambia» while a faked stream is open | never write the param; `changeableMessageId` without `!isStreaming` |
| P5 | the tile's aside: «Analisi di ottobre 2026» after that reading; «Registra · senza periodo» on a planted `register` answer without a reading; none on an empty chat; «Rileggi» → the focus on «Interrompi risposta» | the aside from a constant; focus the textarea |
| Q2 | an answer to a question card is sent with the asking message's route and `routeCarried: true`; a «Continua con» row with neither; «Rileggi» with `route` and no `routeCarried`; on a `register` message without a reading, with the register route | send without `route`; `askingRoute` from `routeReading` only |

**Playwright** (all faked; data-only planting, `doc/guide/e2e-playwright.md`):

- `e2e/assistantRegister.ts`: `installFakeStream` emits `{ type: 'route', reading }` after `meta` — a register reading
  by default, the handler may return `{ text, reading }`; `StreamRecorder.requests` gains `route`; `registerAction`
  and `enterRegister` are deleted; `plantExchange` writes `routeReading` on the assistant message.
- `assistant.register.spec.ts`: the test at :37 asserts no `tablist` «Periodo di analisi» and no «Registra un
  movimento», writes in the composer directly, and finds «Conti» in the companion AFTER the answer; :98 reloads on
  `?thread=`; :266 becomes «Nuova conversazione empties the conversation and drops `?thread`»; :289 goes Back to
  `?thread=` and the next sentence's `threadId` is the planted thread; `?mode=registra` (:157, :271, :294) → `?thread=`.
- `assistant.register.kinds.spec.ts`, `.mobile.spec.ts`, `.question.spec.ts`, `.question.mobile.spec.ts`: each
  `enterRegister(page)` deleted; `?mode=registra` (kinds :240, question :99) → `?thread=`.
- New `e2e/assistant.chat.spec.ts`: **E1** the controls at rest in `main` (visible `button`, `a[href]`, `textarea`,
  `[role=tab]`, `[role=combobox]`) are 11 on an account with one planted memory fact and no thread; **E2** «cambia» →
  «Un movimento da registrare» → «Rileggi» → the second request carries `route.intent: 'register'` and the first
  prompt; **E3** a suggestion sends nothing (`requests` empty); **E4** «⋯» → «Preferenze» shows «Stile di risposta»,
  Esc lands on «⋯»; **E5** a thread planted with a `register` message and no reading opens by `?thread=` with its
  card.
- New `e2e/assistant.chat.mobile.spec.ts`: **E6** at 390 — two header targets ≥ 44px, «⋯» opens a bottom sheet,
  «cambia» ≥ 44px tall, no horizontal overflow.
- `e2e/cashflow.tracciamento.spec.ts:353-361` rewritten: the href stays `/dashboard/assistant?mode=registra`; after
  the click the URL settles without the param (`toHaveURL(/\/dashboard\/assistant$/, { timeout: 60_000 })`), the first
  row of the list «Domande suggerite» reads «Oggi ho speso…» and the composer is focused (today it asserts the
  Registra strip, which goes). Unchanged: `e2e/allocation.consulente.spec.ts:200-205`.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators, the empty chat shows 11 controls and four suggestions; a faked
answer carries «Ho letto: … · cambia»; «⋯» opens three modals; a register sentence becomes a card with no mode
entered. On the owner's account after the deploy, real sentences are read right: an expense, «com'è andato ottobre?»,
«e a settembre?», a macro question.

- **A**: `tsc`, lint, Vitest (three zones), `reactCompilerCoverage`, every `e2e/assistant*.spec.ts`,
  `cashflow.tracciamento.spec.ts`, `allocation.consulente.spec.ts`; `perf:budget`.
- **B**: emulators + seed + `dev:emulator`; the planted memory fact and a register thread (decoys «ornitorinco»,
  «fenicottero» in the notes).
- **C (browser, the session)**: at 1440 and 390, with `page.route` faking the stream (no key): the count, the
  suggestions, the line, the chooser, the menu and the focus returns, screenshots for the owner.
- **D (data)**: the faked request bodies (`recorder.requests`) — `mode: 'auto'`, no period fields, the override.
- **E**: demo account → the locked state as today; in «⋯» Conversazioni and Preferenze are off, Memoria opens its
  modal as today (the header's Memoria was never off in demo); a `?thread=` of another user → the failed-read
  alert, nothing else.
- **F (owner, at his «pronto»)**: after the deploy, on his account, five real sentences — one expense, one income,
  «com'è andato ottobre?», «e a settembre?», one about inflation — each line read aloud, one «cambia» → «Rileggi»; the
  router's first real calls (NOVE-14 § 7 F).
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): fixtures and decoys removed, scripts deleted, emulators stopped.

## 8. Putting it into service

One PR to `develop`, after NOVE-14's. No data change: old threads open as stored. An open tab of the old page keeps
sending explicit modes, which NOVE-14 still serves. The two Cashflow links keep `?mode=registra`.

## 9. Documentation

- `doc/guide/assistente.md` § Per-page blind spots: «una riga di «Continua con» è letta da capo: «e questo
  mese?» sotto un'analisi di ottobre può essere letta come una domanda sui dati di oggi; «cambia» la corregge»
  (decision 52); § the router: `source: 'carried'` and `routeCarried` (decision 53). `doc/guide/email-pdf.md`:
  the periodic comment's contract names the types «Spese Necessarie/Spese Non Necessarie/Debiti» (decision 36).
- `doc/guide/assistente.md`: § Assistente — a verdict over tiles (:277-303) rewritten for the two header controls,
  the «⋯» menu and the locators (`button` «Altre azioni dell'assistente», `list` «Domande suggerite», the line by its
  text, no `tablist`); § Registra's way in and out (:410-422) replaced by «a written sentence read as a registration;
  `?mode=registra` puts the register suggestions first; the open thread is `?thread=`» with the date; the DropdownMenu
  rule (:179-180) gains «Preferenze is a modal since 2026-11-12».
- `AGENTS.md` § Assistant: «the cards follow the MESSAGE's `mode`, never the page's (2026-11-12; pinned by
  `assistantStreamingResponse.test.tsx`)».
- `doc/guide/assistente.md` also: :272-276 (the suggestions are `buildEmptyChatSuggestions`, the first bold), :322
  (no axis), :446 (blind spots: a suggestion writes the composer). The guide stays under 500 lines after NOVE-14's
  section: the rewritten passages replace, they do not add.
- `README.md` § AI Assistant (:63): the period axis, the pencil and the day thread replaced by «a chat: write, the
  assistant reads whether it is a question, an analysis or a movement and on which period; under each answer «Ho
  letto: … · cambia»; «⋯» holds Conversazioni, Memoria, Preferenze»; :67 «opens the Assistente with the register
  suggestions first». `doc/guide/cashflow-tracciamento.md:190`: «the bridge to the Assistente (`?mode=registra`: the
  register suggestions first)». `doc/guide/impostazioni.md`: the Assistente preferences' sentence.
- `DESIGN.md`: § 4's four amendments. `doc/guide/e2e-playwright.md`: `assistantRegister.ts`'s helpers renamed.
- `CLAUDE.md` › Assistente AI line («only a chat; the router reads every message, 2026-11») and › «Latest»;
  `Draft Release Temp.md` (Assistente: the chat, the line, «cambia», the menu); `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The page's costume in the themes**: heir NOVE-20 (on NOVE-11's mechanisms).
- **A thread title from the sentence for registrations**: none, declared (the title rule is the server's, unchanged).
- **A «cambia» on older answers**: none, declared (history is not rewritten).
- **The router itself**: NOVE-14.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-15-assistente-solo-chat.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-15-assistente-solo-chat.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/assistente.md, cashflow-tracciamento.md, impostazioni.md, email-pdf.md, dialog.md,
  e2e-playwright.md, velocita.md PRIMA di scrivere codice
- Leggi DESIGN.md (The Assistente page, The AI-Accent Rule, The Conversation-Is-Content Rule,
  The Modal-Is-A-Tile Rule, The Question-Card Rule) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: assistantChatNarrative.ts e le due
funzioni del selettore con i loro test; l'hook di streaming; i messaggi (la riga, le card
per messaggio); il selettore «cambia»; l'intestazione e le tre modali (nuova è solo
Preferenze); la pagina; «Come funziona»; le frasi fuori pagina (il blocco di oggi nel
prompt, Impostazioni); il codice morto; gli E2E (anche cashflow.tracciamento); gli
emendamenti di DESIGN.md alla lettera e i documenti del § 9. I test PRIMA del codice, ciascuno visto rosso con la
sua mutazione; cifre e categorie inventate. Nessun controllo che spende: lo stream è sempre
finto, la chiamata vera è solo la mia F dopo il deploy. Fermati e chiedimi se: il conteggio
a riposo non fa 11; perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); un E2E di Registra non si riscrive senza
cambiare ciò che prova. Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec on one page that consumes NOVE-14's contract, rewrites five E2E
specs and amends DESIGN.md. Estimated size: 1 session, ~6 h; ~350 lines changed, ~300 deleted, ~600 of tests.
