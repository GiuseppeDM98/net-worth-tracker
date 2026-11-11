# AI-07 — The report as a book: one page per step, the next continues the story

> Series `doc/ai/` (README.md § 5): **depends on AI-03** (retired on 2026-11-07, in develop since 2026-11-07, PR #507:
> `PathRail`, `sceneVariants`, `SCENE_GRID_CLASS` / `SCENE_CARD_CLASS`, `Tile`'s `generated`, the RTL harness) **and
> AI-04** (retired on 2026-11-08, in develop since 2026-11-08, PR #509: «Il
> colloquio», `ConsulenteRevisionTile` with its round, the archive of the previous paths); **implemented after AI-06**
> (order only: nothing of AI-05/AI-06 enters here). Written on 2026-11-08, the same day the owner asked for it, from
> the working tree that became commit 8af05f73 (PR #509) — a line is cited `file:line @ 8af05f73`; the adversarial reading rewrites
> the hash. Executes decisions 91–96 (README.md § 3). **Not yet read adversarially**: the reading (prompt 07) precedes
> the implementation, as README.md § 8 requires; the spec is a development instruction only after it.

## 1. The problem today (evidence on the code)

- **The report is ONE column of up to nine blocks** (`components/allocation/consulente/ConsulenteReport.tsx:199-423`
  @ 8af05f73): the verdict, «Allocazione proposta», «Strumenti», «Obiettivi», «Ruoli degli asset», «Il report» (the
  review's whole markdown in one tile, `:337-347`) or «La strategia» (`:349-359`), «Il colloquio» (`:362-366`),
  «Chiedi una modifica» (`:368-372`), «Applica» (`:374-422`). The reader scrolls past four tiles of figures before the
  text that explains them, and «Applica» sits under everything. The owner, on 2026-11-08, after the interview's phase F (PR #509):
  «dividere il report finale in più parti evitando all'utente di scorrere in verticale, magari una specie di libro,
  dove ogni pagina ha un senso logico da sola e quelle dopo continuano il racconto».
- **The text's structure is prescribed and unused.** The review's contract (`lib/server/allocationAdvice/prompts.ts:420-434`
  @ 8af05f73, `REVIEW_CONTRACT`) asks seven sections in order — «In una frase», «L'allocazione proposta», «Gli strumenti»,
  «Gli obiettivi», «Casa, fondi pensione e illiquidi», «Cosa fare adesso», «Rischi e revisione» — and the revision adds
  «La tua richiesta» right after the first (`:436-440`, `REVISION_CONTRACT`); the strategy's contract (`:149-159`,
  `STRATEGY_CONTRACT`) asks six — «La situazione», «L'allocazione proposta», «Casa, fondi pensione e illiquidi»,
  «Obiettivi», «Cosa cambia rispetto a oggi», «Rischi e revisione» — plus «Rispetto al piano precedente» when a plan is
  in force. `ReactMarkdown` renders the text whole (`ConsulenteReport.tsx:341-343`, `MARKDOWN_COMPONENTS` `:75-96`);
  nothing reads a heading.
- **Two facts of the proposal have no surface**: `proposal.risks` (`lib/utils/allocationAdviceProposal.ts:201` @ 8af05f73,
  up to ten strings) is read by no component (checked on 2026-11-08: no `risks` in `components/`); the review date and
  its reason are the footer line of the «Allocazione proposta» tile (`ConsulenteReport.tsx:234-236`), a tile that
  answers another question.
- **The rail knows the path and the run, not the report**: `PathRail` has two modes (`components/ui/path-rail.tsx:22-30`
  @ 8af05f73) and by rule its ticks «are not buttons and carry no handler» (`:15`; DESIGN.md → The Path-Scene Rule). The
  scene's grid and card classes are exported by the run (`ConsulenteRun.tsx:36-38`, `SCENE_GRID_CLASS`,
  `SCENE_CARD_CLASS`); the turn's mechanics — the direction as state, the element focused at the gesture, the headline
  focused after the slide — live inside the Wizard (`ConsulenteWizard.tsx:191-205` @ 8af05f73) and nowhere else.
- **One URL parameter, read on the server**: `?rivedi=1` (`app/dashboard/allocation/consulente/page.tsx:16-17` @ 8af05f73)
  opens the screens over the applied plan; no page of the report is an address, and no reader of `useSearchParams`
  exists on the route.
- **The motion is the column's**: the cascade once per JS session (`consulenteReportEntrance`, `ConsulenteReport.tsx:55-56`,
  `:136-142`) and the proposed percentages counting up with it (`ProposedPct`, `:58-62`); the slide between screens is
  `sceneVariants` / `sceneVariantsReduced` (`lib/utils/motionVariants.ts:186-206` @ 8af05f73).
- **The tests pin the column**: `e2e/allocation.consulente.report.spec.ts:167-172` @ 8af05f73 counts four `[data-generated]`
  tiles at once and `:211-215` asserts the y-order of three regions; `allocation.consulente.mobile.spec.ts` probes the
  path's slide at 390 and never the report; the route has no `mobile:budget` entry by choice (doc/guide/consulente.md
  § Composizione mobile: «No composition»).
- **The report reaches neither the PDF nor the emails** (checked on 2026-11-08: no reader of `allocationAdvice` under
  `lib/server/`, `lib/services/` or `app/api/` other than the Consulente's own routes). The note of decision 91 in
  README.md § 6 said «the PDF and the email keep the whole report»: there is none to keep; the row is corrected by this
  spec, and § 10 declares them out of scope.

## 2. Goal and acceptance criteria

The report is read as a book: one page per logical step — the words of the model's section, then the figures of its
tile —, turned with «Indietro» / «Avanti», jumped to from the rail at 1440 and from an «Indice» below it, each page an
address; «Applica» is the last page. Each criterion: statement · proof · the mutation that turns the proof red.

1. **The pages are a pure function of the document** (`buildBookPages`, `lib/utils/allocationAdviceBook.ts`, § 4). The
   table of ten pages, in this order and with these ids: `copertina` «In una frase» · `allocazione` «L'allocazione
   proposta» · `strumenti` «Gli strumenti» · `obiettivi` «Gli obiettivi» · `ruoli` «Casa, fondi pensione e illiquidi» ·
   `passi` «Cosa fare adesso» · `rischi` «Rischi e revisione» · `colloquio` «Il colloquio» · `modifica` «Chiedi una
   modifica» · `applica` «Applica». A page exists when it has text (criterion 2) or figures: `allocazione` with a
   proposal, `strumenti` with `document.instruments`, `obiettivi` with goals in the proposal, `ruoli` with a role
   change or an unmatched name, `rischi` with `proposal.risks` or a review date, `colloquio` with a round, `modifica`
   with a report (as the tile today, `ConsulenteReport.tsx:368`), `passi` only with its section; `copertina` and
   `applica` always. Proof: `__tests__/allocationAdviceBook.test.ts` — a full document gives the ten in order; a
   strategy-only document (no report, no instruments) gives `copertina`, `allocazione`, `obiettivi`, `ruoli`,
   `rischi`, `applica` and no `modifica`; a document whose proposal has no goals and no risks and whose text has no
   «Cosa fare adesso» drops `obiettivi`, `rischi`, `passi`. Mutation: make `passi` unconditional → the third case fails.
2. **The text splits by section, leniently** (`splitReportSections`, `assignSections`). A heading is an ATX line of
   level 1–4 or a paragraph that is only bold (`**…**`, an optional «1.» / «1)» before it, an optional colon after); a
   line inside a fenced block is never a heading. Headings are compared normalised — NFD without diacritics, lower
   case, the leading number dropped, `*` `_` `:` `.` and typographic apostrophes dropped or straightened, spaces
   collapsed — against each page's aliases: `copertina` ← «in una frase», «la situazione», «la tua richiesta»;
   `allocazione` ← «l'allocazione proposta», «allocazione proposta», «cosa cambia rispetto a oggi», «rispetto al piano
   precedente»; `strumenti` ← «gli strumenti», «strumenti»; `obiettivi` ← «gli obiettivi», «obiettivi»; `ruoli` ←
   «casa, fondi pensione e illiquidi»; `passi` ← «cosa fare adesso»; `rischi` ← «rischi e revisione», «i rischi», «la
   revisione»; a match is equality or the heading starting with the alias followed by a space. The text before the
   first heading goes to `copertina`; a section whose heading matches no alias goes to the page of the section before
   it (`copertina` when none); the first section of a page that matched the page's aliases drops its heading line,
   every other section on that page keeps it (rendered by `MARKDOWN_COMPONENTS` as its `h3`). When NO heading matches
   and the text is not blank, the book has ONE text page `report` «Il report» right after `copertina`, with the whole
   markdown (the degenerate book). The source is `document.report.markdown`, or `document.strategy.markdown` without
   a report (as `ConsulenteReport.tsx:337-359` chooses today). Proof: `allocationAdviceBook.test.ts` — the review's
   seven sections written «## 1. In una frase» … «## 7. Rischi e revisione» land on seven pages, the first heading
   dropped; the same with bold-only headings «**Gli strumenti**»; «## L'allocazione proposta» and «## Allocazione
   proposta» both reach `allocazione`; «## Note finali» after «## Cosa fare adesso» lands on `passi` under its own
   `###`-rendered heading; the strategy's vocabulary («## La situazione», «## Obiettivi», «## Cosa cambia rispetto a
   oggi», «## Rispetto al piano precedente») reaches `copertina`, `obiettivi`, `allocazione`, `allocazione`; a `##`
   inside a fenced block is text; a markdown with only paragraphs gives the `report` page. Mutation: drop the fallback
   to the previous page → «Note finali» vanishes and its test fails; compare with `includes` instead of equality or
   start → a section «La revisione dei rischi del 2027» is still `rischi` (fine) but «Senza strumenti» becomes
   `strumenti` and its test fails.
3. **One page at a time, on the scene card.** `ConsulenteBook` renders the rail (`PathRail` `mode: 'book'`) and ONE
   card (`SCENE_GRID_CLASS` + `TILE_SURFACE_CLASS` + `SCENE_CARD_CLASS`, `aria-label` «Pagina n di N · {title}»): the
   eyebrow row — «Pagina n di N · {title}» (`BOOK_COPY.eyebrow`) and the page's aside (criterion 8) —, the headline
   (the page's title as `<p tabIndex={-1}>`; on `copertina` the `PageVerdict` of `buildConsulenteVerdict` is the
   headline and the eyebrow is a `<p>`, not an `<h2>`, so the page has one `h2`), the page's reading line when its
   tile had one, the section's text (`ReactMarkdown`, `MARKDOWN_COMPONENTS`), the figures, the tile's footer line
   when it had one, then the pager footer (criterion 4). The pages slide with `sceneVariants` along the direction of
   the turn (+1 toward a higher index, −1 toward a lower one; `data-turn="forward" | "back"` on the sliding wrapper),
   the card clips its x-overflow, the first render does not animate, and after a turn the focus moves to the new
   page's headline — the card itself on `copertina` — only when the focus still sits where the gesture left it or on
   `body` (the Wizard's rule, `ConsulenteWizard.tsx:11-16` @ 8af05f73), through the shared `useSceneTurn` (§ 4). Proof:
   `__tests__/consulenteBook.test.tsx` — the first page's `aria-label`, «Avanti» → the second page's, `data-turn`
   `forward`, the headline `document.activeElement`; «Indietro» → `back`; `consulenteBook.test.tsx` also asserts
   exactly one `[data-scene]` at a time. E2E at 390 (`allocation.consulente.book.mobile.spec.ts`): the `[data-scene]`
   transform probe of the mobile spec, applied to a turn, records no horizontal overflow of `main`. Mutation: set the
   direction in an effect from the index → the React Compiler test (criterion 12) or `data-turn` fails on the first
   back turn.
4. **The pager.** The footer holds «Indietro» (outline; disabled on `copertina`), «Indice» (outline, `desktop:hidden`)
   and «Avanti» (filled; absent on `applica`); on `applica` the right side holds the apply tile's two actions, «Rifai
   il percorso» (outline) and «Applica alle impostazioni» (filled, disabled as today, `ConsulenteReport.tsx:415-419`);
   below `tablet:` the footer is a two-column grid (`grid grid-cols-2 gap-2`), from `tablet:` one row with the pager
   left and the page's primaries right; every button `h-11 desktop:h-9`. «Indice» opens a `ResponsiveModal` (eyebrow
   «Il report · N pagine», title «Indice», reading «Ogni pagina si legge da sola; «Applica» è l'ultima.») whose body
   is the pages as `divide-y` button rows of 44px — «n · title» —, the current one `aria-current="page"`; choosing a row
   closes the modal and turns to that page. From `desktop:` the rail's labels are buttons (`PathRail` `mode: 'book'`
   with `interactive: true`, passed by the host from `!useCompactLayout()`, false on the server and during hydration):
   each `<li>` holds a `<button>` of `desktop:min-h-8` with the tick and the 11px label, the current `aria-current="page"`;
   with `interactive: false` the rail renders the path mode's plain `<li>`s — the strip's 4px ticks are never a target.
   Proof: `__tests__/pathRail.test.tsx` (book mode: with `interactive` N buttons, the current `aria-current="page"`, a
   click calls `onSelect(index)`; without it zero buttons and zero handlers); `consulenteBook.test.tsx` (the «Indice»
   dialog's N rows, the current one `aria-current`, a row turns the page and the dialog closes; «Indietro» disabled on
   the first page; no «Avanti» on the last); E2E 1440 (`allocation.consulente.report.spec.ts`: the rail's «Gli
   strumenti» button → the card «Pagina 3 di 10 · Gli strumenti»); E2E 390 (`book.mobile.spec.ts`: «Indice» → the
   drawer, every row ≥ 44px, «Rischi e revisione» → page 7). Mutation: render the buttons regardless of `interactive`
   → the no-button case fails.
5. **A page is an address.** `?pagina=<id>` opens that page (`page.tsx` reads `params.pagina` as it reads `rivedi`
   and passes `initialPage`; an unknown or absent id is `copertina`; with `rivedi=1` the screens open and the param is
   ignored). Every turn calls `window.history.replaceState(null, '', bookPageUrl(location.search, id))` from the
   gesture's handler — never from an effect —: `pagina` set to the page's id, removed on `copertina`, the other
   parameters kept; the history never grows. Proof: `allocationAdviceBook.test.ts` (`bookPageUrl('?x=1', 'strumenti')`
   → `?x=1&pagina=strumenti`; `('?pagina=rischi&x=1', null)` → `?x=1`; `('', null)` → the pathname alone, no `?`);
   `consulenteBook.test.tsx` (`vi.spyOn(window.history, 'replaceState')` called once per turn with `pagina=…`, never
   `pushState`); E2E (`report.spec.ts`: `goto('…/consulente?pagina=strumenti')` → page 3; «Avanti» → `page.url()`
   contains `pagina=obiettivi` and `history.length` read by `evaluate` is unchanged). Mutation: `pushState` → the
   history length assertion fails.
6. **The page survives a document change.** The current page is remembered by id, not by index: a revision that
   replaces the report (`updatedAt` changes, the query rereads) leaves the reader on `modifica`; a page that no longer
   exists falls back to `copertina`. Proof: `consulenteBook.test.tsx` — rerender with a document whose text lost «Cosa
   fare adesso» while on `modifica`: still «Chiedi una modifica», now «Pagina 8 di 9»; rerender while on `passi` with
   that document: `copertina`. Mutation: remember the index → the first case shows «Rischi e revisione».
7. **The accent follows the author.** The card of `copertina`, `allocazione`, `strumenti`, `obiettivi`, `ruoli`,
   `passi`, `rischi` and `report` is `generated` (`data-generated=""`, `AI_GENERATED_SURFACE_CLASS`, the eyebrow in
   `AI_GENERATED_EYEBROW_CLASS`): their body is the model's — `copertina` opens with the rule-generated verdict, never
   accented itself, and continues with the model's «In una frase». `colloquio`, `modifica` and `applica` are not
   (decision 79 and DESIGN.md → The AI-Accent Rule). At most ONE `[data-generated]` is in the DOM. Proof: E2E
   (`report.spec.ts`: `toHaveCount(1)` on open; on `colloquio` `toHaveCount(0)`; «Rivedi il report» keeps its
   `--ai-glow` class); `consulenteBook.test.tsx` per page. Mutation: mark `applica` generated → the count on the last
   page fails.
8. **The figures are today's, moved, not rewritten.** Each page's body is the former tile's body, byte for byte in
   content: `allocazione` the class rows with `ProposedPct` and the reading `describeProposalReading(rows)`, the aside
   «oggi → proposta», the footer «Percentuali sulla base della pagina Allocazione (…)» WITHOUT the review sentence;
   `strumenti` the sleeves (the «in portafoglio» chip, the « · duration N anni» line, the caveat), the aside «verificati
   sul web» / «senza ricerca web», its reading; `obiettivi` the goals (aside «N nel piano»); `ruoli` the changes and
   the unmatched line (aside «N cambi»); `rischi` NEW figures: the aside «rivedi entro il {date}» (`BOOK_COPY.reviewAside`),
   the reading `proposal.reviewReason`, and `proposal.risks` as `divide-y` rows (nothing with zero risks); `colloquio`
   the `InterviewRoundRows` of `ConsulenteInterviewTile` (aside `describeInterviewAside`); `modifica` the body of
   `ConsulenteRevisionTile` (the requests, `[data-revision-interview]`, the textarea `#consulente-revision`, the round
   `[data-revision-round]`, «Salta le domande», «Rivedi il report» as the page's primary in the footer); `applica` the
   three checkboxes, the warnings, the `role="status"` line, the aside «applicato il …» / «niente è scritto finché non
   confermi», the reading of today. The two tiles become page bodies through their exported bodies (§ 4), so their
   RTL suites stay green unchanged. Proof: `report.spec.ts` re-targeted page by page (the duration line on page 3,
   «2 tornate» and «Preferisco non dire» on page 8, «1 richiesta» and the revision's round on page 9, the round-before-
   revision flow (the round before a revision, decision 24) on page 9, «Applica» disabled on a failed document on the last page);
   `consulenteBook.test.tsx` (the risks rows, the review aside). Mutation: keep the review sentence in the
   `allocazione` footer → the «printed once» assertion of `consulenteBook.test.tsx` fails.
9. **Motion.** The page shown at open cascades its blocks once per JS session (`staggerContainer` × `cardItem` on the
   eyebrow row, the headline, the text, the figures, the footer; the once-flag `consulenteReportEntrance.cascade`); the
   proposed percentages count up the first time `allocazione` mounts in the session (`consulenteReportEntrance.countUp`);
   a turn slides (`sceneVariants`, 0.25 s in, 0.18 s out); under reduced motion the turn fades (`sceneVariantsReduced`),
   nothing cascades, nothing counts. DESIGN.md's table rows «Report, entering» and «Figures» keep their values; their
   subject becomes the first page and the proposal page (§ 9). Proof: E2E (`report.spec.ts`: the opacity probe on the
   card's children < 0.5 then 1 on open; «Avanti» → the pcts probe records more than one value ending «70,0%»; back to
   the Allocazione and in: min opacity 1 and `['70,0%']` on `allocazione`; the reduced-motion test: 1 and
   `['70,0%']`). Mutation: one flag for both → a session that opened on `?pagina=strumenti` never counts up on
   `allocazione` (the E2E opening on page 3 then turning back fails).
10. **The running view is unchanged, the failed document is a book too.** `document.status === 'running'` keeps the
    verdict, «Le fasi» and «Ricomincia il percorso» (`ConsulenteReport.tsx:182-197`); a failed document is a book over
    the strategy's text with the negative verdict on `copertina`, no `modifica`, «Applica» disabled. Proof:
    `report.spec.ts` («a failed run…» and «a run still going…» adapted). Mutation: build the book while running → the
    stage rows test fails.
11. **Touch and pointer floors**: the footer's buttons `h-11 desktop:h-9`, the index rows 44px, the rail's buttons
    `desktop:min-h-8` (a pointer target, the dense-list floor of `TILE_FOOTER_ACTION_CLASS`). Proof: E2E 390 (`book.mobile.spec.ts`
    measures the footer's buttons and the drawer's rows ≥ 44px); `pathRail.test.tsx` asserts the class. Mutation:
    drop `min-h-8` → the class assertion fails.
12. **The React Compiler compiles everything** (`__tests__/reactCompilerCoverage.test.ts`): the direction and the page
    id are state, refs are never read during render, no `try … finally` and no `throw` inside a `try` in a component
    or hook; `useSceneTurn` is extracted from the Wizard with no behaviour change — the Wizard's suites and
    `allocation.consulente.mobile.spec.ts` («the headline still takes the focus») stay green. Proof: the suite and the
    spec. Mutation: read `pendingFocus.current` during render → the suite names the component.
13. **The bundle.** Nothing the Allocazione page imports changes: `allocationAdviceBook.ts` is imported by the book
    alone, `BOOK_COPY` sits in `allocationAdviceNarrative.ts` as strings (the module stays zod-free,
    doc/guide/consulente.md § Files); `perf:budget` is green with every ceiling as before; the Consulente route's First
    Load JS is recorded before and after in SESSION_NOTES (`ResponsiveModal` — the Drawer and the Dialog — enters the
    route for the «Indice»: the first modal on it). Proof: the gate of § 7 C. Mutation: import `allocationAdviceBook`
    from the Allocazione page → `perf:budget` red on `allocation`.
14. **The documents of § 9 are written in the same commit**, the owner's words of 2026-11-08 quoted once, in
    doc/guide/consulente.md.

## 3. Decisions

The owner's (README.md § 3, numbered): **91** (2026-11-08) a spec of its own, not part of AI-04; **92** (2026-11-08) the
spec is written the same day and the MOCK is the first step of its implementation (§ 4.0), not a step before the spec;
**93** the text splits by section onto the page of its tile (the lenient reader, the fallback to the previous page, the
degenerate `report` page); **94** the pager is the footer's «Indietro» / «Avanti» on every width, the rail's labels as
buttons from `desktop:`, an «Indice» modal below it — The Path-Scene Rule gains the clause «in the book the rail is a
control»; **95** «Chiedi una modifica» is a page of its own, the one before «Applica»; **96** a page is an address,
`?pagina=<id>`, written with `replaceState`.

The author's calls (2026-11-08; reversible at the reading, each a finding if the reader disagrees):

- The cover is a `generated` card: it opens with the rule-generated verdict (never accented itself) and continues with
  the model's «In una frase» and «La tua richiesta»; the alternative — a non-generated cover with an accented sub-block
  for the model's text — would add a surface The Question-Card Rule does not describe.
- The review date, its reason and `proposal.risks` move to «Rischi e revisione»: the proposal page keeps its base
  sentence only (The One-Tile-One-Question Rule; the review sentence was answering another question).
- The eyebrow stays the `<h2>` and the title a `<p tabIndex={-1}>`, as the path's screens; on the cover the verdict's
  own `<h2>` is the heading, the eyebrow a `<p>`, and the focus target is the card.
- The page is remembered by id (criterion 6); a revision keeps the reader where the request was made.
- The Wizard's turn mechanics become `useSceneTurn`, the book its second consumer: a hook of ~20 lines whose two copies
  would have to stay byte-identical (AGENTS.md's Rule of Three names a map in three files; a stateful hook with a focus
  side effect is extracted at the second, because a drift between the two would be a behaviour bug, not a style one).
- No arrow keys and no swipe (§ 10): a textarea and radios live on pages, and the path has neither.
- The «Indice» button is `desktop:hidden`: at 1440 the rail's labels are the index.

## 4. Solution

### 4.0 The mock, the first step of the implementation (decision 92)

Before any component: an Impeccable design pass (the `impeccable` skill with DESIGN.md as the normative layer; memory:
never regenerate DESIGN.md, a user-pinned direction beats the concept seed) that produces a static HTML mock in the
scratchpad — never committed — of FOUR views on invented figures (the E2E fixture's names: «ETF ornitorinco», «Fondo
fenicottero», 70 / 30, «meno cripto»): `copertina` at 1440 with the rail's labels as buttons and the current one
marked; `strumenti` at 390 (the eyebrow row, the title, the reading, the section's text, the sleeves, the footer's two
rows); `applica` at 390 (the four buttons of the footer); the «Indice» drawer open at 390. Light and dark. The owner
reads it and answers with AskUserQuestion; a change he asks is a numbered decision in README.md § 3 AND a rewrite of
the line of this spec it touches, BEFORE the code (a mock that diverges from the spec is a finding for the spec, never
a licence for the code). The mock's figures and names are never the owner's.

### `lib/utils/allocationAdviceBook.ts` (new, pure, no zod, no React)

```ts
export type BookPageId = 'copertina' | 'allocazione' | 'strumenti' | 'obiettivi' | 'ruoli' | 'passi' | 'rischi' | 'report' | 'colloquio' | 'modifica' | 'applica';
export interface BookPageSpec { id: BookPageId; title: string; aliases: readonly string[]; generated: boolean }
/** The ten pages in reading order; `report` is not here — it is inserted after `copertina` by `buildBookPages` in the degenerate case. */
export const BOOK_PAGE_TABLE: readonly BookPageSpec[];
export const BOOK_REPORT_PAGE: BookPageSpec; // { id: 'report', title: 'Il report', aliases: [], generated: true }
export function normalizeHeading(text: string): string;
export interface ReportSection { heading: string; body: string }
export function splitReportSections(markdown: string): { preamble: string; sections: ReportSection[] };
/** The text of each page, the first matched heading dropped, the others kept as `### heading`. */
export function assignSections(split: { preamble: string; sections: ReportSection[] }): Map<BookPageId, string>;
export interface BookPageInput {
  markdown: string | null;
  hasProposal: boolean; hasInstruments: boolean; hasGoals: boolean; hasRoles: boolean; hasRisks: boolean;
  hasInterview: boolean; hasRevision: boolean;
}
export interface BookPage { id: BookPageId; title: string; text: string | null; generated: boolean }
export function buildBookPages(input: BookPageInput): BookPage[];
export function bookIndexOf(pages: readonly BookPage[], id: string | null | undefined): number; // 0 when unknown
export function turnDirection(from: number, to: number): 1 | -1;
export const BOOK_PAGE_PARAM = 'pagina';
/** `search` as `location.search` (with or without `?`); the other params kept, `pagina` set or removed, '' when nothing is left. */
export function bookPageUrl(search: string, id: BookPageId | null): string;
```

The heading reader: fenced blocks (```` ``` ```` or `~~~`) are skipped whole; an ATX heading is `/^#{1,4}\s+(.+?)\s*#*\s*$/`;
a bold-only paragraph is a line `/^\*\*(.+?)\*\*:?\s*$/` preceded and followed by a blank line or the text's edge;
`normalizeHeading` applies `normalize('NFD')`, strips `\p{M}`, lower-cases, drops a leading `/^\d+[.)]\s*/`, maps `’`
to `'`, drops `*`, `_`, `:` and a trailing `.`, collapses whitespace. `assignSections` walks the sections in order with
a cursor page (`copertina` at start): a match moves the cursor; the section is appended to the cursor's text (the
heading line re-emitted as `### ` + heading unless it is the page's first matched one). `buildBookPages` applies the
existence rules of criterion 1 and the degenerate case of criterion 2.

### `lib/utils/allocationAdviceNarrative.ts` (+ `BOOK_COPY`)

```ts
export const BOOK_COPY = {
  eyebrow: (n: number, total: number, title: string) => `Pagina ${n} di ${total} · ${title}`,
  back: 'Indietro', next: 'Avanti', index: 'Indice',
  indexEyebrow: (total: number) => `Il report · ${total === 1 ? '1 pagina' : `${total} pagine`}`,
  indexTitle: 'Indice',
  indexReading: "Ogni pagina si legge da sola; «Applica» è l'ultima.",
  reviewAside: (date: string) => `rivedi entro il ${date}`,
} as const;
```

Strings only: the module is imported by the Allocazione page (`describeReviewBy`) and must stay zod-free.

### `components/ui/path-rail.tsx` (+ `mode: 'book'`)

```ts
| { mode: 'book'; pages: readonly { id: string; title: string }[]; current: number; interactive: boolean; onSelect: (index: number) => void }
```

`BookList`: `<ol aria-label="Le pagine">`; with `interactive` each `<li>` is a `<button type="button" aria-current={isCurrent ? 'page' : undefined} className="flex min-w-0 items-center gap-2 desktop:min-h-8 …">` with the tick (`STRIP_TICK_CLASS`, `bg-foreground` current, `bg-foreground/50` before it, `bg-border` after) and the label (`NAME_CLASS`); without it the path mode's plain `<li>` with `aria-current="page"` on the current. The strip keeps `STRIP_CLASS` (24px below `desktop:`). The host wraps it in the same `<nav aria-label="Dove sei">` as the path mode. Its comment gains the sentence: «In the book the rail IS a control from `desktop:` (decision 94, 2026-11-08); below it the ticks stay 4px and the «Indice» button is the jump.»

### `components/allocation/consulente/useSceneTurn.ts` (new; extracted from `ConsulenteWizard.tsx:191-205`)

```ts
export function useSceneTurn(): {
  direction: 1 | -1;
  headlineRef: React.RefObject<HTMLElement | null>;
  /** Remembers the focused element and sets the direction, then runs `effect` (the dispatch, the setState). */
  move(toward: 1 | -1, effect: () => void): void;
  /** For `onAnimationComplete`: focuses the headline when the focus is still where the gesture left it or on `body`. */
  focusHeadline(): void;
}
```

The Wizard replaces its three declarations and two functions with the hook; `move(toward, action)` becomes
`move(toward, () => dispatch(action))`. No behaviour change: its suites and `allocation.consulente.mobile.spec.ts` are
the guard.

### `components/allocation/consulente/ConsulenteBook.tsx` (new) and the page bodies

`ConsulenteReport.tsx` keeps: the running view (`:182-197`), the data hooks and plans (`:114-129`), the apply state and
`apply()` (`:131-180`), the once-flags (`consulenteReportEntrance` becomes `{ cascade: false, countUp: false }`),
`ProposedPct`, `MARKDOWN_COMPONENTS`, `ROLE_LABEL`, `markApplied`. Its column (`:199-423`) is replaced by
`<ConsulenteBook …>` whose props are the data the pages need plus `initialPage: string | null`, `onRedo`, the apply
props (`applyTargets/setApplyTargets`, …, `canApply`, `applyState`, `apply`). The former tile bodies become
`components/allocation/consulente/ConsulenteBookPages.tsx`: `ProposalBody`, `InstrumentsBody`, `GoalsBody`,
`RolesBody`, `RisksBody` (new: the risks rows), `ApplyBody` — each returns `{ aside, reading, figures, footer }` as
render pieces, no `Tile` — and the two tiles export their bodies: `ConsulenteInterviewTile.tsx` already exports
`InterviewRoundRows` (`:15`); `ConsulenteRevisionTile.tsx` gains `export function RevisionBody(props)` (the textarea,
the round, «Salta le domande») and `export function useRevisionPrimary(...)` for the footer's «Rivedi il report», the
tile itself becoming the thin `Tile` wrapper of both (its RTL suite unchanged). The book:

- state: `pageId: BookPageId` (initial `bookIndexOf(pages, initialPage)` → id), `indexOpen: boolean`; `useSceneTurn()`.
- `pages = useMemo(() => buildBookPages({...}), [document, rows, roles, goalPlan])`; `index = bookIndexOf(pages, pageId)`
  (a vanished page → 0, criterion 6).
- `turnTo(next: number)`: `move(turnDirection(index, next), () => { setPageId(pages[next].id); window.history.replaceState(null, '', bookPageUrl(window.location.search, pages[next].id === 'copertina' ? null : pages[next].id)); setIndexOpen(false); })`.
- render: `<div className={SCENE_GRID_CLASS}>` → `<nav aria-label="Dove sei"><PathRail mode="book" pages={pages} current={index} interactive={!compact} onSelect={turnTo} /></nav>` → `<section aria-label={BOOK_COPY.eyebrow(index + 1, pages.length, page.title)} data-generated={page.generated ? '' : undefined} tabIndex={page.id === 'copertina' ? -1 : undefined} ref={cardRef} className={cn(TILE_SURFACE_CLASS, SCENE_CARD_CLASS, page.generated && AI_GENERATED_SURFACE_CLASS)}>` → `<AnimatePresence mode="wait" initial={false} custom={direction}>` → `<motion.div key={page.id} data-scene={page.id} data-turn={direction === 1 ? 'forward' : 'back'} custom={direction} variants={reduced ? sceneVariantsReduced : sceneVariants} initial="enter" animate="center" exit="exit" onAnimationComplete={(d) => d === 'center' && focusHeadline()}>` → the cascade wrapper (`motion.div variants={staggerContainer} initial={playsCascade ? 'hidden' : false} animate="visible"`, `data-consulente-report=""`) → the blocks, each a `motion.div variants={cardItem}`: the eyebrow row, the headline (or `PageVerdict`), the reading, the text, the figures, the tile footer line, the pager footer.
- the «Indice»: `<ResponsiveModal open={indexOpen} onClose={() => setIndexOpen(false)} eyebrow={BOOK_COPY.indexEyebrow(pages.length)} title={BOOK_COPY.indexTitle} reading={BOOK_COPY.indexReading}>` with `<ol className="divide-y divide-border">` of `<button type="button" aria-current className="flex min-h-11 w-full items-center gap-3 text-left …">`.
- the footer: `<div className="mt-6 grid grid-cols-2 gap-2 border-t border-border pt-4 tablet:flex tablet:items-center tablet:justify-between">`; left `<div className="contents tablet:flex tablet:gap-2">` «Indietro» · «Indice»; right the page's primaries («Avanti», or on `applica` «Rifai il percorso» + «Applica alle impostazioni», on `modifica` «Rivedi il report» beside «Avanti»).

### `ConsulenteClient.tsx` and `page.tsx`

`page.tsx` reads `params.pagina` (a string; an array or undefined → null) and passes `initialPage`; `ConsulenteClient`
forwards it to `ConsulenteReport` → `ConsulenteBook`. With `startFresh` the screens open and `initialPage` is unused.

### DESIGN.md § 5 → AI Surfaces (hand-written, the two clauses)

- The Path-Scene Rule, after «no tick is a button»: «**In the book** (the report read page by page, 2026-11): from
  `desktop:` the rail's labels ARE buttons — the current page `aria-current="page"` — and below it an «Indice»
  modal of 44px rows is the jump; the pager is the footer's «Indietro» / «Avanti»; a page is an address
  (`?pagina=`); the text of the model's report is split by its sections onto the page of the tile it explains.»
- The AI-Accent Rule, in the list of what a model wrote: «the pages of the report whose body is the model's (the cover
  included, which opens with the never-accented verdict and continues with «In una frase»)».
- The motion table: «Report, entering» → «Report, the first page shown»; «Figures (the proposed percentages)» → «…, on
  the proposal page's first mount».

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **The Allocazione page's bundle** (doc/guide/consulente.md § Files, 2026-11-08: +34 KB gz seen when the narrative
  reached zod) — here it means `allocationAdviceBook.ts` imports nothing but types and is imported by the book alone;
  `BOOK_COPY` is strings in the narrative; `perf:budget`'s `allocation` entry proves it.
- **AGENTS.md § React Compiler and the hooks rules** — here it means the direction, the page id and the index's open
  state are `useState`; `pendingFocus` is a ref written in handlers and read in `focusHeadline` only; no `try …
  finally`; `replaceState` in the handler, never in an effect (`react-hooks/set-state-in-effect` and «a request belongs
  to the click» both).
- **Hydration** — here it means the first page comes from the server param (`initialPage`), never from
  `window.location` in render; `useCompactLayout()` is false during hydration, so the rail renders plain `<li>`s first
  and buttons after — the same pattern as every closed row.
- **AGENTS.md § Accessibility** — here it means one `h2` per page (the eyebrow, or the verdict's on the cover), the
  focus moved after a turn with `preventScroll`, `aria-current="page"` on the rail's and the index's current item,
  the index rows ≥ 44px, the footer's buttons `h-11` below `desktop:`, the modal through `ResponsiveModal` (the Drawer's
  focus return to the «Indice» button needs no `returnFocusTo`: the opener is a button).
- **The One-Tile-One-Question Rule** — here it means the review sentence is printed once, on `rischi`; the proposal
  page's footer keeps the base sentence only.
- **The heading reader never trusts the model** — here it means the aliases are the contract's titles plus the
  strategy's, every unmatched section lands on the previous page (nothing is dropped), fenced blocks are skipped, and a
  text with no heading at all is still read (the `report` page).
- **`ReactMarkdown`'s components map stays module-level** (`ConsulenteReport.tsx:74`) — here it means the page bodies
  import `MARKDOWN_COMPONENTS` from where it is, exported.
- **The E2E fixture is the fake document of `report.spec.ts`** (two classes, one goal, two rounds, one request) — here
  it means its markdown gains the seven headings so the split is exercised, and a second planted variant without
  headings exercises the `report` page.
- **A probe never opens a control that spends** — unchanged: «Rivedi il report» on page 9 runs on the faked route.
- **No owner data in a tracked file** — the mock, the fixtures and the screenshots use the invented names.

## 6. Tests per level (with the mutation that proves each)

- `__tests__/allocationAdviceBook.test.ts` (new): `normalizeHeading` (accents, numbers, bold, apostrophes); `splitReportSections`
  (ATX 1–4, bold-only, fenced skipped, preamble); `assignSections` (criterion 2's cases, the first heading dropped, the
  later kept as `### `); `buildBookPages` (criterion 1's three documents, the degenerate `report`); `bookIndexOf`
  (unknown → 0); `turnDirection`; `bookPageUrl` (criterion 5's three cases). Mutations: as in criteria 1, 2, 5.
- `__tests__/allocationAdviceNarrative.test.ts`: `BOOK_COPY.eyebrow(3, 10, 'Gli strumenti')` = «Pagina 3 di 10 · Gli
  strumenti»; `indexEyebrow(1)` «Il report · 1 pagina», `(10)` «… 10 pagine».
- `__tests__/pathRail.test.tsx`: book mode with and without `interactive` (criterion 4), `aria-current="page"`, the
  `desktop:min-h-8` class, `onSelect(index)` on click; the path and run modes unchanged.
- `__tests__/useSceneTurn.test.tsx` (new): `move` sets the direction and remembers the active element; `focusHeadline`
  focuses when the active element is the remembered one or `body`, not when the user moved it.
- `__tests__/consulenteBook.test.tsx` (new): the ten pages on the full fixture, the `aria-label`s, «Avanti» / «Indietro»
  / the index rows / `replaceState` (criteria 3–7), the risks rows and the review aside printed once (criterion 8), the
  cover's single `h2`, `data-generated` per page, the document change (criterion 6). Framer in jsdom: the variants do
  not animate; `onAnimationComplete` is invoked by firing it on the wrapper through `act` as `consulenteRun.test.tsx`
  does with timers, or by asserting the focus after the `AnimatePresence` settles with `await screen.findBy…`.
- `__tests__/consulenteInterviewTile.test.tsx`, `consulenteRevisionTile` (if present) and `useConsulenteRun.test.tsx`:
  unchanged and green (the bodies exported, the tiles still rendered by their wrappers).
- `__tests__/reactCompilerCoverage.test.ts`: green (criterion 12).
- E2E: `e2e/allocation.consulente.report.spec.ts` rewritten page by page (criteria 4, 5, 7, 8, 9, 10); new
  `e2e/allocation.consulente.book.mobile.spec.ts` at 390 (the overflow probe on a turn, the «Indice» drawer and its
  rows ≥ 44px, the footer's two rows, reduced motion: the page appears in place and the headline takes the focus);
  `allocation.consulente.spec.ts`, `.interview.spec.ts`, `.interview.mobile.spec.ts`, `.mobile.spec.ts` unchanged and
  green (the Wizard's refactor). Every spec on the emulators, the route faked where a model would be called.

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the fourteen criteria; the outcome «the report is a book of up to ten pages, each the model's section with
  the figures of its tile, turned from the footer, jumped to from the rail at 1440 and from «Indice» below, each an
  address; «Applica» closes it».
- **B**: the MOCK of § 4.0 read with the owner (the four views, light and dark) BEFORE the code; then `BOOK_COPY` and
  the page titles read aloud.
- **C**: `node -v` on 24; `npx tsc --noEmit`; `npm run lint`; Vitest whole under `TZ=Europe/Rome`, in the machine's
  zone and under `TZ=UTC`; with the emulators up, `npx playwright test e2e/allocation.consulente.spec.ts
  e2e/allocation.consulente.interview.spec.ts e2e/allocation.consulente.interview.mobile.spec.ts
  e2e/allocation.consulente.mobile.spec.ts e2e/allocation.consulente.report.spec.ts
  e2e/allocation.consulente.book.mobile.spec.ts`; `npm run build`, the Consulente route's First Load JS before and after
  in SESSION_NOTES; `npm run perf:budget` (every ceiling as before).
- **D**: no server code changes; the planted documents of the two E2E specs are the data check (a report with the
  seven headings, one without).
- **E**: screenshots in the scratchpad (never committed), faked route, light and dark: every page at 390 and 1440, the
  «Indice» drawer at 390 and the dialog at 768, the rail with the current label at 1440, the failed document's cover;
  the height of each page at 390 noted in SESSION_NOTES (the fixture's, not a user's).
- **F**: at the owner's «pronto», never on the PR's preview (demo only): in production after the deploy on the report
  the owner will have made at the end of the series, or on the mirror over a document copied from production when one
  exists (`npm run mirror:seed -- <email>`; on 2026-11-08 production holds none: the owner reset it with
  `npm run consulente:reset`). The owner reads the book on the phone and at 1440: whether each page «ha un senso logico
  da sola», whether the split put a section where he expects it, whether the rail and the «Indice» are enough to find
  «Applica». `npm run mirror:remove` after, if seeded.
- **G**: the mock, the screenshots and every throwaway deleted; the mirror removed; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

Branch `feat/consulente-libro`, commit `feat(consulente): the report as a book — one page per section and tile, the
rail as the index, a page as an address`, PR to `develop`. No flag: the column is replaced.

## 9. Documentation

- `doc/guide/consulente.md`: § Files — `ConsulenteReport.tsx` «(verdict, tiles, markdown, «Applica»)» becomes «(the
  running view, the data, «Applica»'s writes; the book is `ConsulenteBook.tsx`, its page bodies
  `ConsulenteBookPages.tsx`, the turn `useSceneTurn.ts`)»; Pure gains `allocationAdviceBook.ts` (the page table, the
  heading reader, the address); the suites gain `allocationAdviceBook`, `consulenteBook`, `useSceneTurn`; Browser gains
  `allocation.consulente.book.mobile.spec.ts`. § The report and «Applica» is renamed **§ The report as a book** and
  rewritten: the ten pages and their existence rules, the split (the aliases, the fallback, the degenerate page), the
  pager (the footer, the rail from `desktop:`, the «Indice»), the address, the accent per page, the motion (the first
  page's cascade, the proposal page's count-up), «Chiedi una modifica» as page 9 with everything the bullet says today,
  «Applica» as the last page; the owner's words of 2026-11-08 quoted once. § Composizione mobile adds «the book is not a
  composed page either: one card, one page at a time; the «Indice» is the one `ResponsiveModal` of the route». § Per-page
  blind spots adds: «A heading the model invents lands on the previous page, never lost, never its own page» · «A
  report with no recognisable heading is one page «Il report» after the cover» · «`?pagina=` is ignored with
  `rivedi=1`» · «The count-up plays on the proposal page's first mount in the session, not on the cover».
- `DESIGN.md` § 5 → AI Surfaces: the two clauses and the two table subjects of § 4 (hand-written).
- `AGENTS.md` § Allocazione › Consulente: the first bullet gains «; the report is read as a book of up to ten pages,
  the model's text split by section onto the page of its tile, the rail its index from `desktop:` (2026-11)».
- `CLAUDE.md`: § Key Features › Allocazione › Consulente adds «the report read as a book (2026-11)»; § Dialogs and
  forms «40 modals» becomes «41 modals»; `doc/guide/dialog.md`'s count and list gain the «Indice».
- `Draft Release Temp.md`: ONE sentence appended to the «Allocazione — Consulente» entry: «The report now reads as a
  book: one page per step — the Consulente's words and the figures they explain —, turned from the bottom of the page,
  with an index to jump to any page; «Applica» is the last one.»
- `doc/ai/README.md` § 6: AI-07's row «implemented on …, PR #… in develop since …».

## 10. Declared out of scope

- Swipe and arrow keys to turn pages: the path has neither, and a textarea and radios live on pages.
- A PDF or an email of the report: none exists today (§ 1), and none is added.
- The Allocazione's «Rivedi con il Consulente» pointing at a page: it opens the screens (`?rivedi=1`) by design.
- A memory of the last page across sessions (localStorage): the address is the memory.
- The strategy's and the review's contracts: unchanged — the book reads what they already prescribe.

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Allocazione › Consulente, § React Compiler and the hooks rules, § Accessibility,
§ Commands), DESIGN.md § 5 «AI Surfaces» (The Path-Scene Rule, The AI-Accent Rule) e «Modal (a Tile lifted off the
page)», doc/guide/consulente.md, doc/guide/dialog.md, doc/guide/e2e-playwright.md, doc/ai/README.md § 3-4-7-8,
doc/ai/AI-07-report-libro.md. Node 24 (`node -v`). PRIMA del codice il mock della § 4.0 (skill impeccable, DESIGN.md
normativo, cifre inventate): me lo mostri e aspetti il mio OK; una modifica che chiedo diventa una decisione in README
§ 3 e una riga riscritta della spec, poi il codice segue la spec. Implementa AI-07 così com'è scritta:
allocationAdviceBook.ts puro (la tabella delle pagine, il lettore tollerante delle intestazioni, l'indirizzo);
PathRail mode 'book'; useSceneTurn estratto dal Wizard senza cambiare comportamento; ConsulenteBook con la card della
scena, il footer, l'«Indice» su ResponsiveModal, ?pagina= con replaceState dal gesto; i corpi delle tessere spostati,
non riscritti; i rischi e la data di revisione sulla pagina «Rischi e revisione». Test: le suite della § 6, Vitest in
entrambe le zone, le sei spec Playwright del Consulente con la route SEMPRE finta, reactCompilerCoverage verde,
perf:budget verde, First Load JS della route prima e dopo. Fermati e chiedimi se: un contratto del percorso (PR #507) o del colloquio (PR #509) nel
codice, o una regola di DESIGN.md § 5, differisce da quello citato nella § 4; una suite verde prima di te diventa
rossa per un motivo fuori da questa spec. Collaudo: § 7; la F sul mio report vero, in produzione dopo il deploy o sul
mirror, al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si
committa.
```

Model: **Opus 5.5**, effort **high**. Estimated size: 1 session, ~5 h; ~180 lines pure (`allocationAdviceBook`), ~40
`path-rail`, ~30 `useSceneTurn`, ~260 `ConsulenteBook`, ~160 moved into `ConsulenteBookPages`, ~450 tests, one E2E
spec rewritten and one new.
