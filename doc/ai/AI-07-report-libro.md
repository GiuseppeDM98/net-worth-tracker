# AI-07 — The report as a book: one page per step, the next continues the story

> Series `doc/ai/` (README.md § 5): **depends on AI-03** (retired on 2026-11-07, in develop since 2026-11-07, PR #507:
> `PathRail`, `sceneVariants`, `SCENE_GRID_CLASS` / `SCENE_CARD_CLASS`, `Tile`'s `generated`, the RTL harness, the
> Wizard's turn mechanics) **and AI-04** (retired on 2026-11-08, in develop since 2026-11-08, PR #509: «Il
> colloquio», `ConsulenteRevisionTile` with its round, the archive of the previous paths); **implemented after AI-06**
> (retired on 2026-11-11, in develop since 2026-11-11, PR #514; order only: nothing of Registra (PR #512, #514) enters here).
> Written on 2026-11-08, the same day the owner asked for it; every `file:line` is cited on `develop` @ d818ba1d.
> Executes decisions 91–96 and 100–117 (README.md § 3). **Read adversarially on 2026-11-11** (prompt 07: six Opus
> readers, 50 distinct findings verified on the code, decisions 100–117): the spec is a development instruction.
> **Implemented on 2026-11-12**, PR #517 (decision 118: the `/dashboard/cashflow` ceiling 786 → 787; README.md § 6).

## 1. The problem today (evidence on the code)

- **The report is ONE column of up to nine blocks** (`components/allocation/consulente/ConsulenteReport.tsx:199-423`):
  the verdict, «Allocazione proposta», «Strumenti», «Obiettivi», «Ruoli degli asset», «Il report» (the
  review's whole markdown in one tile, `:337-347`) or «La strategia» (`:349-359`), «Il colloquio» (`:362-366`),
  «Chiedi una modifica» (`:368-372`), «Applica» (`:374-422`). The reader scrolls past four tiles of figures before the
  text that explains them, and «Applica» sits under everything. The owner, on 2026-11-08, after the interview's phase F (PR #509):
  «dividere il report finale in più parti evitando all'utente di scorrere in verticale, magari una specie di libro,
  dove ogni pagina ha un senso logico da sola e quelle dopo continuano il racconto».
- **The text's structure is prescribed and unused.** The review's contract (`lib/server/allocationAdvice/prompts.ts:420-434`,
  `REVIEW_CONTRACT`) asks seven sections in order — «In una frase», «L'allocazione proposta», «Gli strumenti»,
  «Gli obiettivi», «Casa, fondi pensione e illiquidi», «Cosa fare adesso», «Rischi e revisione» — and the revision adds
  «La tua richiesta» right after the first (`:436-440`, `REVISION_CONTRACT`); the strategy's contract (`:149-159`,
  `STRATEGY_CONTRACT`) asks six — «La situazione», «L'allocazione proposta», «Casa, fondi pensione e illiquidi»,
  «Obiettivi», «Cosa cambia rispetto a oggi», «Rischi e revisione» — plus «Rispetto al piano precedente» when a plan is
  in force. The contracts write their own list as `1. **Titolo** — testo` (`:423-429`, `:152-157`), a shape a model
  copies. `ReactMarkdown` renders the text whole (`ConsulenteReport.tsx:341-343`, `MARKDOWN_COMPONENTS` `:76-97`);
  nothing reads a heading.
- **Two facts of the proposal have no surface of their own**: `proposal.risks` (`lib/utils/allocationAdviceProposal.ts:201`,
  up to ten strings) is read by no component (checked on 2026-11-11: no `risks` in `components/`); the review date and
  its reason — both REQUIRED by the schema (`:199-200`) — are the footer line of the «Allocazione proposta» tile
  (`ConsulenteReport.tsx:234-236`), a tile that answers another question.
- **The rail knows the path and the run, not the report**: `PathRail` has two modes (`components/ui/path-rail.tsx:22-30`)
  and by rule its ticks «are not buttons and carry no handler» (`:15`; DESIGN.md → The Path-Scene Rule); the path mode
  renders its own `<nav aria-label="Dove sei">` (`:118-123`). The scene's grid and card classes are exported by the
  run (`ConsulenteRun.tsx:36-38`, `SCENE_GRID_CLASS` — the grid's — and `SCENE_CARD_CLASS` — the card's); the turn's
  mechanics — the direction as state, the element focused at the gesture, the headline focused after the slide — live
  inside the Wizard (`ConsulenteWizard.tsx:191-205`) and nowhere else; the Wizard has no RTL suite.
- **Two URL facts**: `?rivedi=1` (`app/dashboard/allocation/consulente/page.tsx:14-17`) opens the screens over the
  applied plan; no page of the report is an address, and no reader of `useSearchParams` exists on the route.
- **The motion is the column's**: the cascade once per JS session (`consulenteReportEntrance`, `ConsulenteReport.tsx:55-56`,
  `:136-142`) and the proposed percentages counting up with it (`ProposedPct`, `:58-62`); the slide between screens is
  `sceneVariants` / `sceneVariantsReduced` (`lib/utils/motionVariants.ts:186-206`), inside an `AnimatePresence
  mode="wait" initial={false}` (`ConsulenteWizard.tsx:248`) — and framer-motion blocks the initial animation of EVERY
  descendant of an `AnimatePresence initial={false}` on its first render (`use-visual-state.mjs`,
  `presenceContext.initial === false`).
- **The tests pin the column**: `e2e/allocation.consulente.report.spec.ts:167-172` counts four `[data-generated]`
  tiles at once and `:211-215` asserts the y-order of three regions; `allocation.consulente.mobile.spec.ts` probes the
  path's slide at 390 and never the report; `e2e/consulentePath.ts:21-25` (`openConsulente`, shared by the path's
  specs) presses «Rifai il percorso», which the column shows on first paint; the route has no `mobile:budget` entry by
  choice (doc/guide/consulente.md § Composizione mobile: «No composition»). `ConsulenteRevisionTile` has no RTL suite.
- **«Applica alle impostazioni» is ABSENT, not disabled, unless the document is `ready`** (`ConsulenteReport.tsx:415`),
  and the three checkboxes with it (`:380`); a document whose revision failed keeps its report, and a run that failed
  at the strategy has no text at all (`lib/server/allocationAdvice/run.ts:541-551`).
- **Three sentences speak of the column**: the applied verdict's «…«Rifai il percorso», in fondo, riparte…» and the
  no-proposal verdict's «Leggi il testo qui sotto…» (`lib/utils/allocationAdviceNarrative.ts:191`, `:199`), the
  instruments' reading «…leggilo nel report qui sotto.» (`ConsulenteReport.tsx:257`).
- **The report reaches neither the PDF nor the emails** (checked on 2026-11-08: no reader of `allocationAdvice` under
  `lib/server/`, `lib/services/` or `app/api/` other than the Consulente's own routes), and the app prints nothing:
  no `print:` class and no `@media print` exist (checked on 2026-11-11), and the shell's `#page-main` is an
  `overflow-y-auto` box inside a screen-high flex column (`app/dashboard/layout.tsx:91`), which a printer clips.
- **`npm run mirror:seed` never copies `allocationAdvice`** (`scripts/mirrorCollections.ts:16`, `TOUR_ONLY_DOCS`): a
  report on the mirror exists only after a run made there.
- **Modals**: `grep '<ResponsiveModal'` gives 41 mounts in 40 files on 2026-11-11, while CLAUDE.md, doc/guide/dialog.md
  and DESIGN.md say 40 (39 files); the route has none.

## 2. Goal and acceptance criteria

The report is read as a book: one page per logical step — the words of the model's section, then the figures of its
tile —, turned with «Indietro» / «Avanti», jumped to from the rail at 1440 and from «Indice» below it, each page an
address; «Applica» is the last page; a printer gets every page in sequence. Each criterion: statement · proof · the
mutation that turns the proof red.

1. **The pages are a pure function of the document** (`buildBookPages`, `lib/utils/allocationAdviceBook.ts`, § 4). The
   table of ten pages, in this order and with these ids: `copertina` «In una frase» · `allocazione` «L'allocazione
   proposta» · `strumenti` «Gli strumenti» · `obiettivi` «Gli obiettivi» · `ruoli` «Casa, fondi pensione e illiquidi» ·
   `passi` «Cosa fare adesso» · `rischi` «Rischi e revisione» · `colloquio` «Il colloquio» · `modifica` «Chiedi una
   modifica» · `applica` «Applica». The text's source is `document.report.markdown`, else `document.strategy.markdown`,
   else none (`source: 'report' | 'strategy' | null`). The cover's title follows the source (decision 116): «In una
   frase» with the report and with no text at all, «La situazione» with the strategy alone. A page exists when it has
   text (criterion 2) or figures: `allocazione` and `rischi` with a proposal (`hasProposal`: `document.report?.proposal
   ?? document.strategy?.proposal` is not null — the review date is required, so a proposal always has a `rischi`
   page), `strumenti` with `document.instruments` (`hasInstruments`), `obiettivi` with `proposal.goals.length > 0`
   (`hasGoals`), `ruoli` with `roles.changes.length + roles.unmatched.length > 0` (`hasRoles`), `colloquio` with
   `document.interview.rounds.length > 0` (`hasInterview`), `modifica` with `document.report` (`hasReport`, as the tile
   today, `ConsulenteReport.tsx:368`), `passi` only with its section; `copertina` and `applica` always. Proof:
   `__tests__/allocationAdviceBook.test.ts` — a full document gives the ten in order; a strategy-only document (no
   report, no instruments, no interview) gives `copertina` titled «La situazione», `allocazione`, `obiettivi`, `ruoli`,
   `rischi`, `applica` and no `modifica`; a document with a proposal without goals and a text without «Cosa fare
   adesso» drops `obiettivi` and `passi` and keeps `rischi`; a document with no text and no proposal (failed at the
   strategy) gives `copertina` titled «In una frase» and `applica`. Mutation: make `passi` unconditional → the third
   case fails.
2. **The text splits by section, leniently** (`splitReportSections`, `assignSections`; decisions 93, 102, 115). Three
   shapes open a section; a line inside a fenced block never does:
   - **ATX**: a line of level 1–4, `/^#{1,4}\s+(.+?)\s*#*\s*$/`.
   - **Bold-only**: a line that is only bold, with an optional «1.» / «1)» before it and an optional colon after,
     `/^(?:\d+[.)]\s+)?\*\*(.+?)\*\*:?\s*$/` — a blank line after it is not required.
   - **Inline** (the contracts' own list shape): `/^(?:\d+[.)]\s+)?\*\*(.+?)\*\*\s*[—–:-]\s+(\S.*)$/` ONLY when the
     normalised bold EQUALS an alias of a page; the bold is the heading and the rest of the line is the first paragraph
     of the section's body.

   When at least one ATX heading matches an alias, the section level is the smallest level among the matched ATX
   headings: ATX headings of that level or shallower open sections, deeper ATX headings stay in the body verbatim, and
   the bold shapes are text. When no ATX heading matches, the bold-only and inline shapes open sections and every ATX
   heading stays in the body verbatim. Headings are compared normalised (`normalizeHeading`, in this order: NFD
   without diacritics; lower case; `*` and `_` dropped; typographic apostrophes straightened; a leading `/^\d+[.)]\s*/`
   dropped; `:` and a trailing `.` dropped; spaces collapsed and trimmed) against each page's aliases: `copertina` ←
   «in una frase», «la situazione», «la tua richiesta»; `allocazione` ← «l'allocazione proposta», «allocazione
   proposta», «cosa cambia rispetto a oggi», «rispetto al piano precedente»; `strumenti` ← «gli strumenti»,
   «strumenti»; `obiettivi` ← «gli obiettivi», «obiettivi»; `ruoli` ← «casa, fondi pensione e illiquidi»; `passi` ←
   «cosa fare adesso»; `rischi` ← «rischi e revisione», «i rischi», «la revisione». A match is equality, or the heading
   starting with the alias followed by a space (ATX and bold-only shapes). The text before the first section goes to
   `copertina`; a section whose heading matches no alias goes to the page of the section before it (`copertina` when
   none), its heading re-emitted as `## ` + the heading's text (`MARKDOWN_COMPONENTS` renders it as its `<h3>`, under
   the page's one `<h2>`). The heading line is DROPPED only when it is the first section of its page AND equals an
   alias of that page AND that alias is the page's printed title normalised (so «La tua richiesta» on a cover titled
   «In una frase», «Cosa cambia rispetto a oggi» on the proposal page and every prefix-matched heading keep their
   line, re-emitted as `## `). **The degenerate book** (decision 115): when the matched headings land on FEWER THAN TWO
   different pages and the text is not blank, no section is assigned — the cover carries the verdict alone and ONE
   text page `report` follows it with the whole markdown, titled «Il report» with the report and «La strategia» with
   the strategy alone (decision 116). Proof: `allocationAdviceBook.test.ts` — the review's seven sections written
   «## 1. In una frase» … «## 7. Rischi e revisione» land on seven pages, each first heading dropped; the same with
   bold-only headings «**Gli strumenti**» and with «2. **L'allocazione proposta**» directly followed by a text line;
   the same in the inline shape «1. **In una frase** — La proposta regge.» (the cover's text is «La proposta regge.»);
   «**Nota bene** — testo» (no alias) is text, not a section; «## L'allocazione proposta» and «## Allocazione proposta»
   both reach `allocazione`; «## Note finali» after «## Cosa fare adesso» lands on `passi` under its own `## ` line;
   «### ETF azionari» under «## Gli strumenti» stays in `strumenti` verbatim and «### Obiettivi» under «## Cosa fare
   adesso» does NOT move to `obiettivi`; a «**Obiettivi**» bold-only line in a text whose sections are ATX is text;
   «## La tua richiesta» after «## In una frase» stays on the cover WITH its heading line; the strategy's vocabulary
   («## La situazione», «## Obiettivi», «## Cosa cambia rispetto a oggi», «## Rispetto al piano precedente») reaches
   `copertina`, `obiettivi`, `allocazione`, `allocazione`; a `##` inside a fenced block is text; a markdown with only
   paragraphs, and one whose only recognised heading is «## In una frase», both give the `report` page with the whole
   markdown and a cover without text. Mutations: drop the fallback to the previous page → «Note finali» vanishes and
   its test fails; compare with `includes` instead of equality or start → «## Senza strumenti» becomes `strumenti` and
   its test (it lands on the previous page) fails; let the inline shape accept a prefix → «**Nota bene** — …» test
   unchanged but «**Strumenti alternativi** — testo» becomes a section and its test fails.
3. **One page at a time, on the scene card.** `ConsulenteBook` renders the rail (`PathRail` `mode: 'book'`) and ONE
   card inside `SCENE_GRID_CLASS` (the grid's class): `<section>` with `TILE_SURFACE_CLASS` + `SCENE_CARD_CLASS`,
   `aria-label` «Pagina n di N · {title}». EVERYTHING inside the card slides (decision 104): the eyebrow row —
   «Pagina n di N · {title}» (`BOOK_COPY.eyebrow`) as the page's one `<h2>` in `TILE_EYEBROW_CLASS`, and the page's
   aside (criterion 8) —, the headline, the reading line when the page has one (`NarrativeText`, `mt-2 text-[13px]
   leading-[1.45] text-foreground`, as `Tile`), the section's text (`ReactMarkdown`, `MARKDOWN_COMPONENTS`), the
   figures, the footnote line when the tile had one, then the pager footer (criterion 4). The headline is the focus
   target and always lives INSIDE the sliding page: the page's title as `<p tabIndex={-1}>` in the Wizard's headline
   class, and on `copertina` a `<div tabIndex={-1} className="outline-none">` that wraps the `PageVerdict` of
   `buildConsulenteVerdict` (there the verdict's own `<h2>` is the page's heading and the eyebrow is a `<p>`, so every
   page has exactly one `h2`). The pages slide with `sceneVariants` along the direction of the turn (+1 toward a higher
   index, −1 toward a lower one; `data-turn="forward" | "back"` and `data-scene={page.id}` on the sliding wrapper), the
   card clips its x-overflow, the page shown at open does not slide, and the page that leaves is `inert` for the
   length of its exit (a second tap on its «Avanti» does nothing). After a turn the focus moves to the new page's
   headline only when the focus still sits where the gesture left it or on `body` (the Wizard's rule,
   `ConsulenteWizard.tsx:11-16`) — always after a row of «Indice» —, through the shared `useSceneTurn` (§ 4). **The
   scroll** (decision 108): from the turn's handler, when the card's top edge is above the top of `#page-main`'s box,
   `card.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })`; the card carries `scroll-mt-4
   desktop:scroll-mt-5`; the focus keeps `preventScroll`. Proof: `__tests__/consulenteBook.test.tsx` — the first
   page's `aria-label`, «Avanti» → the second page's, `data-turn` `forward`, the headline `document.activeElement`;
   «Indietro» → `back`; exactly one `[data-scene]` once the turn has settled; one `h2` inside the card on `copertina`
   and on `strumenti`; `scrollIntoView` (stubbed on the prototype) called with `block: 'start'` when the card's stubbed
   `getBoundingClientRect().top` is negative and not called when it is positive. E2E at 390
   (`allocation.consulente.book.mobile.spec.ts`): the `[data-scene]` transform probe of the mobile spec, applied to a
   turn, records no horizontal overflow of `main`; after «Avanti» pressed at the bottom of `strumenti`, the card's top
   is inside the viewport; two `click()`s on «Avanti» dispatched in the same `evaluate` advance ONE page. Mutation: set
   the direction in an effect from the index → `npm run lint` names `react-hooks/set-state-in-effect` in
   `ConsulenteBook.tsx`; drop `inert` → the double-click test lands two pages ahead.
4. **The pager** (decisions 94, 106, 111, 112). The footer holds «Indietro» (outline; disabled on the first page),
   «Indice» (outline, `desktop:hidden`) and the page's own buttons: «Avanti» (filled; absent on `applica`); on
   `applica` «Rifai il percorso» (outline) and, ONLY when `document.status === 'ready'`, «Applica alle impostazioni»
   (filled, disabled by `!canApply` or while writing or once done, as `ConsulenteReport.tsx:415-419`); on `modifica`
   «Rivedi il report» (filled, the AI control's classes; its label and handler are the draft's primary, criterion 8),
   «Salta le domande» (outline, when the draft shows it) and «Avanti» as an OUTLINE button there only. Every button
   `h-11 desktop:h-9`. Below `tablet:` the footer is a column, `gap-2`: the page's buttons first, each full width, the
   filled one on top — «Avanti»; or «Applica alle impostazioni», «Rifai il percorso»; or «Rivedi il report», «Salta le
   domande», «Avanti» —, then one row with «Indietro» and «Indice» side by side (`grid grid-cols-2 gap-2`). From
   `tablet:` it is one row: «Indietro» · «Indice» on the left; on the right, in this order, «Rifai il percorso» ·
   «Applica alle impostazioni» on `applica`, «Salta le domande» · «Rivedi il report» · «Avanti» on `modifica`
   («Avanti» is the rightmost button on every page that has it). «Indice» opens a `ResponsiveModal` (eyebrow «Il
   report · N pagine», title «Vai a una pagina», reading «Ogni pagina si legge da sola; «Applica» è l'ultima.»,
   `returnFocusTo` the book's headline ref) whose body is `<ol className="divide-y divide-border">` of `<li>`, each
   holding a `<button type="button">` row of 44px — «n · title» — with `aria-current={isCurrent ? 'page' : undefined}`;
   choosing a row closes the modal and turns to that page; choosing the current row only closes it. From `desktop:`
   the rail's labels are buttons (`PathRail` `mode: 'book'` with `interactive: true`; the host passes
   `!useCompactLayout()`, read at the real width on the first render because the book mounts after the auth wait):
   each `<li>` holds a `<button>` of `min-h-8 [@media(pointer:coarse)]:min-h-11` with the tick and the 11px label, the
   current one `aria-current="page"`, and the list is ONE Tab stop (`useRovingFocus(pages.length, 'vertical')`:
   `containerProps` on the `<ol>`, `itemProps(i)` on each button; the arrows move along the rail, Enter opens); with
   `interactive: false` the rail renders plain `<li>`s with `aria-current="page"` on the current — the strip's 4px
   ticks are never a target. `turnTo(index)` with the current index is a no-op. Proof: `__tests__/pathRail.test.tsx`
   (book mode: with `interactive` N buttons inside `<li>`s, the current `aria-current="page"`, exactly one button with
   `tabIndex` 0, ArrowDown moves the focus to the next, a click calls `onSelect(index)`; without it zero buttons and
   zero handlers; one `navigation` landmark named «Dove sei» in both); `consulenteBook.test.tsx` (the «Indice»
   dialog's title «Vai a una pagina», its N rows, the current one `aria-current`, a row turns the page and the dialog
   closes, the current row closes without `replaceState`; «Indietro» disabled on the first page; no «Avanti» on the
   last; on `modifica` «Avanti» has the outline variant; on `applica` of a failed document `queryByRole('button', {
   name: 'Applica alle impostazioni' })` is null); E2E 1440 (`allocation.consulente.report.spec.ts`: the rail's «Gli
   strumenti» button → the card «Pagina 3 di 10 · Gli strumenti»; one Tab from the page header's last control lands on
   the rail's current button and the next on the card's first control); E2E 390 (`book.mobile.spec.ts`: «Indice» → the
   drawer, every row ≥ 44px, «Rischi e revisione» → page 7 and the headline is `document.activeElement`; on `applica`
   «Applica alle impostazioni» is as wide as the card's content box and above «Rifai il percorso»). Mutation: render
   the rail's buttons regardless of `interactive` → the no-button case fails.
5. **A page is an address** (decisions 96, 107). `?pagina=<id>` opens that page: `page.tsx` reads `params.pagina` (a
   string; an array or undefined → null) beside `rivedi` and passes `initialPage`; an unknown or absent id is the
   first page; with `rivedi=1` the screens open and the param is ignored. The page id lives in `ConsulenteClient`
   (§ 4), so it survives the running view; a document NEWER than the page's opening (`createdAt` after `openedAt`)
   opens on its cover whatever the URL says. Every turn calls `window.history.replaceState(null, '',
   bookPageUrl(window.location.pathname, window.location.search, id))` from the gesture's handler — never from an
   effect —: `pagina` set to the page's id, removed on `copertina`; `rivedi` removed; the other parameters kept; the
   history never grows. «Rifai il percorso» (the book's and the running view's) removes `pagina` the same way and
   forgets the page. Proof: `allocationAdviceBook.test.ts` (`bookPageUrl('/p', '?x=1', 'strumenti')` →
   `/p?x=1&pagina=strumenti`; `('/p', '?pagina=rischi&x=1', null)` → `/p?x=1`; `('/p', '?rivedi=1', 'obiettivi')` →
   `/p?pagina=obiettivi`; `('/p', '', null)` → `/p`); `consulenteBook.test.tsx` (`vi.spyOn(window.history,
   'replaceState')` called once per turn with a URL holding `pagina=…`, never `pushState`); E2E (`report.spec.ts`:
   `goto('…/consulente?pagina=strumenti')` → page 3; «Indietro» → page 2 and `page.url()` holds `pagina=allocazione`;
   «Avanti» twice → `pagina=obiettivi` and `history.length` read by `evaluate` unchanged; back on the cover the URL has
   no `pagina`; «Rifai il percorso» on the last page → the URL has no `pagina`). Mutation: `pushState` → the history
   length assertion fails; return `''` from `bookPageUrl` on the cover → the «no `pagina` on the cover» assertion
   fails (an empty URL leaves the address as it was).
6. **The page survives a document change.** The current page is remembered by id, not by index: a revision that
   replaces the report (`updatedAt` changes, the query rereads, `createdAt` unchanged) leaves the reader on `modifica`;
   a page that no longer exists falls back to the first. Proof: `consulenteBook.test.tsx` — rerender with a document
   whose text lost «Cosa fare adesso» while on `modifica`: still «Chiedi una modifica», now «Pagina 8 di 9»; rerender
   while on `passi` with that document: the cover. Mutation: remember the index → the first case shows «Applica».
7. **The accent follows the author** (decision 117). A page's card is `generated` (`data-generated=""`,
   `AI_GENERATED_SURFACE_CLASS`, the eyebrow in `AI_GENERATED_EYEBROW_CLASS`) when its body holds what the model
   wrote: `allocazione`, `strumenti`, `obiettivi`, `ruoli`, `passi`, `rischi`, `report` always; `copertina` ONLY when
   it carries model text — it opens with the rule-generated verdict, never accented itself, and continues with the
   model's section; with the verdict alone (the degenerate book, a document without text) it is not. `colloquio`,
   `modifica` and `applica` never are (decision 79 and DESIGN.md → The AI-Accent Rule). At most ONE `[data-generated]`
   is in the DOM (the print sheet carries none). Proof: E2E (`report.spec.ts`: `toHaveCount(1)` on open; on
   `colloquio`, `modifica` and `applica` `toHaveCount(0)`; «Rivedi il report» keeps its `--ai-glow` class; on the
   variant without headings the cover `toHaveCount(0)` and `report` `toHaveCount(1)`); `consulenteBook.test.tsx` per
   page. Mutation: mark `applica` generated → the count on the last page fails.
8. **The figures are today's, moved, not rewritten** — except the three sentences of decision 110. Each page's body
   is the former tile's body: `allocazione` the class rows with `ProposedPct` and the reading
   `describeProposalReading(rows)`, the aside «oggi → proposta», the footnote EXACTLY «Percentuali sulla base della
   pagina Allocazione (negoziabile e non negoziabile, al netto dei debiti).»; `strumenti` the sleeves (the «in
   portafoglio» chip, the « · duration N anni» line, the caveat), the aside «verificati sul web» / «senza ricerca
   web», its reading — the one without candidates rewritten «La ricerca ha scritto solo testo: è quello di questa
   pagina.»; `obiettivi` the goals (aside «N nel piano»); `ruoli` the changes and the unmatched line (aside «N
   cambi»); `rischi` NEW figures: the aside «rivedi entro il {date}» (`BOOK_COPY.reviewAside`), the reading
   `proposal.reviewReason`, and `proposal.risks` as `divide-y` rows under `aria-label="Rischi"` (no list with zero
   risks); `colloquio` the WHOLE body of `ConsulenteInterviewTile` — every round's sub-eyebrow, note and
   `InterviewRoundRows` — with the aside `describeInterviewAside`; `modifica` the whole body of
   `ConsulenteRevisionTile` — the aside «in corso» / «N richieste», the reading `REVISION_COPY.reading`, the requests
   with `[data-revision-interview]`, the textarea `#consulente-revision`, the round `[data-revision-round]`, the
   `role="status"` line — with its two buttons in the footer (criterion 4); `applica` the three checkboxes, the
   warnings and the `role="status"` line (only when `ready` with a proposal, as today), the aside «applicato il …» /
   «niente è scritto finché non confermi», the reading of today. **«{model} · {date}»** (decision 109), today the aside
   of «Il report» / «La strategia», is the aside of the cover, taken from the text's source; in the degenerate book it
   is the aside of the `report` page and the cover has none; with no text nobody has it. **The verdict's two
   sentences** (decision 110): «…«Rifai il percorso», nell'ultima pagina, riparte dal piano in vigore e dal suo
   perché.» and «Leggi il testo nelle pagine che seguono; «Applica» non è disponibile perché il blocco strutturato non
   è valido. Rifai il percorso per ottenerne uno.». **The revision's draft survives a turn** (decision 105): the
   request's text, the round asked and its answers live in `useRevisionDraft`, called ONCE by `ConsulenteBook`, so
   leaving `modifica` and coming back finds them, and a round in flight lands. The two tile components are deleted:
   their bodies are exported (§ 4) and nothing else rendered them. Proof: `report.spec.ts` re-targeted page by page
   (the duration line on page 3, «2 tornate», the rounds' notes and «Preferisco non dire» on page 8, «1 richiesta» and
   the round-before-revision flow on page 9 — type a request, «Rivedi il report», «Indietro», «Avanti»: the textarea
   still holds the request and the round's cards are there —, no «Applica alle impostazioni» on a failed document's
   last page); `consulenteBook.test.tsx` (the risks rows; `allocazione`'s footnote equals the exact sentence above and
   does not contain «Rivedi entro»; `reviewReason` is on `rischi`; the cover's aside holds the model's name, the
   proposal page's does not); `__tests__/allocationAdviceNarrative.test.ts` (the two verdict sentences). Mutation: keep
   the review sentence in the `allocazione` footnote → the exact-sentence assertion fails; keep the draft's state in
   the page body → the E2E's textarea is empty after the two turns.
9. **Motion.** The page shown at open cascades its blocks once per JS session (`staggerContainer` × `cardItem` on the
   eyebrow row, the headline, the reading, the text, the figures, the footnote, the pager; the once-flag
   `consulenteReportEntrance.cascade`), and only that page: after the first turn nothing cascades again in that
   mount. The proposed percentages count up the first time `allocazione` mounts in the session
   (`consulenteReportEntrance.countUp`), whichever page was opened; a turn slides (`sceneVariants`, 0.25 s in, 0.18 s
   out); under reduced motion the turn fades (`sceneVariantsReduced`), nothing cascades, nothing counts. The exact
   mechanics are § 4 (no `initial={false}` on the `AnimatePresence`). DESIGN.md's table rows «Report, entering» and
   «Figures» keep their values; their subject becomes the first page shown and the proposal page (§ 9). Proof: E2E
   (`report.spec.ts`: the opacity probe on the card's blocks < 0.5 then 1 on open, and the cover's `[data-scene]`
   transform never differs from none on open; «Avanti» → the pcts probe scoped to `[data-scene]` records more than
   one value ending «70,0%»; «Avanti», «Indietro» → `['70,0%']` only, and min opacity 1; back to the Allocazione and
   in: min opacity 1 and `['70,0%']` on `allocazione`; the reduced-motion test: 1 and `['70,0%']`; a session that
   opens on `?pagina=strumenti` and turns back counts up on `allocazione`). Mutation: one flag for both → the
   `?pagina=strumenti` case never counts up.
10. **The running view is unchanged, the failed document is a book too.** `document.status === 'running'` keeps the
    verdict, «Le fasi» and «Ricomincia il percorso» (`ConsulenteReport.tsx:182-197`). A failed document is a book over
    the text it has — the report when a revision failed (so `modifica` exists), the strategy when the run failed
    after it, none when it failed at the strategy (the cover and `applica` alone) — with the negative verdict on the
    cover and `applica` holding «Rifai il percorso» alone. Proof: `report.spec.ts` («a failed run…» and «a run still
    going…» adapted; the failed one asserts «Pagina 1 di N», the negative headline and, on the last page, no
    checkbox and no «Applica alle impostazioni»). Mutation: build the book while running → the stage rows test fails.
11. **Touch and pointer floors**: the footer's buttons `h-11 desktop:h-9`, the index rows `min-h-11`, the rail's
    buttons `min-h-8 [@media(pointer:coarse)]:min-h-11` (the dense-list floor and the touch floor of
    `TILE_FOOTER_ACTION_CLASS`). Proof: E2E 390 (`book.mobile.spec.ts` measures the footer's buttons and the drawer's
    rows ≥ 44px); `pathRail.test.tsx` asserts both classes. Mutation: drop `min-h-8` → the class assertion fails.
12. **The React Compiler compiles everything** (`__tests__/reactCompilerCoverage.test.ts`) **and the lint is clean**:
    the direction, the page id and the first-turn flag are state; a ref is never read during render and no hook
    returns one (`react-hooks/refs`: `useSceneTurn` RECEIVES the headline's ref); no `try … finally` and no `throw`
    inside a `try` in a component or hook; `useSceneTurn` is extracted from the Wizard with no behaviour change —
    `e2e/allocation.consulente.spec.ts` and `allocation.consulente.mobile.spec.ts` («the headline still takes the
    focus») stay green, the Wizard having no RTL suite. Proof: the suite, `npm run lint` and the two specs. Mutation:
    read `pending.current` during render → the suite names the component.
13. **The bundle** (decision 114). `allocationAdviceBook.ts` is imported by the book alone; `BOOK_COPY` sits in
    `allocationAdviceNarrative.ts` as strings (the module stays zod-free, doc/guide/consulente.md § Files), a module
    the Allocazione page imports: `npm run perf:budget` is run before and after, and when the key
    `/dashboard/allocation` (ceiling 604, measured 603,8 on 2026-11-11) passes its ceiling the session STOPS and asks
    the owner with AskUserQuestion to raise it to the measured value rounded up, with `raisedBy` in `perf/budget.json`
    and a row in doc/guide/velocita.md § Registro dei tetti alzati; every other ceiling stays as it is — except
    `/dashboard/cashflow`, 786 → 787 (decision 118: 786,0 → 786,2 with the raw KB unchanged, the module ids renumbered). The Consulente
    route's initial JS is measured before and after with the method of doc/guide/velocita.md (the gzip sum of the
    `<script src>` of the built route's HTML — `next build` prints no First Load JS since Next 16) and written in
    SESSION_NOTES: `ResponsiveModal` — the Drawer and the Dialog — enters the route for «Indice», the first modal on
    it. Proof: the gate of § 7 C. Mutation: import `allocationAdviceBook` from the Allocazione page → `perf:budget` red
    on `/dashboard/allocation`.
14. **A printer gets the whole book** (decision 113). Beside the grid the book renders the print sheet
    (`ConsulenteBookPrint`, § 4): `hidden print:block`, the verdict, then every page except `modifica` and `applica`
    in order — its title as an `<h2>`, the aside, the reading, the text, the figures, the footnote — with no accent,
    no button and the percentages printed at once; the grid (rail and card) is `print:hidden`. The shell is opened
    for the printer ONLY while a print sheet is in the page (`app/globals.css`, § 4): no other page's print changes.
    Copying and the browser's find keep seeing the open page only (§ 10). Proof: E2E (`report.spec.ts`, after
    `page.emulateMedia({ media: 'print' })`: `[data-book-print]` is visible and holds the eight titles of the
    fixture's printable pages in order, «Chiedi una modifica» is not in it, `[data-consulente-report]` is hidden,
    `getComputedStyle(#page-main).overflowY` is `visible` and the sidebar is not visible; with `media: 'screen'` back,
    `[data-book-print]` is hidden; on `/dashboard/allocation` under print media `#page-main`'s `overflowY` is still
    `auto`); `consulenteBook.test.tsx` (`[data-book-print]` holds no `button`, no `[data-generated]`, no `textarea`).
    Mutation: drop the `:has([data-book-print])` scope → the Allocazione assertion fails.
15. **The documents of § 9 are written in the same commit**, the owner's words of 2026-11-08 quoted once, in
    doc/guide/consulente.md.

## 3. Decisions

The owner's (README.md § 3, numbered). Of 2026-11-08: **91** a spec of its own, not part of AI-04; **92** the MOCK is
the first step of its implementation (§ 4.0); **93** the text splits by section onto the page of its tile; **94** the
pager is the footer's «Indietro» / «Avanti» on every width, the rail's labels as buttons from `desktop:`, an «Indice»
modal below it; **95** «Chiedi una modifica» is a page of its own, the one before «Applica»; **96** a page is an
address, `?pagina=<id>`, written with `replaceState`.

Of 2026-11-11, at the adversarial reading: **100** phase F is ONE real run on the mirror, in the implementation
session; **101** the mock is `.tmp-libro.html` at the repo root, screenshots, one redraw at most; **102** three
heading shapes, the contracts' inline one included, the contracts unchanged; **103** the series' folder is retired in
the same session as this spec; **104** the whole page slides and the page that leaves is `inert`; **105** the
revision's draft survives a turn; **106** the footer below `tablet:` and on `modifica`; **107** the page id lives in
`ConsulenteClient`, a new document opens on its cover, a turn cleans `rivedi`, «Rifai il percorso» cleans `pagina`;
**108** the card's top scrolls into view, smoothly; **109** «{model} · {date}» on the cover; **110** the three
sentences rewritten for the book; **111** the rail is one Tab stop; **112** the modal's title is «Vai a una pagina»;
**113** the print sheet, every page with its figures; **114** `BOOK_COPY` in the narrative, the Allocazione ceiling
raised on the owner's OK when it must; **115** the degenerate book below two matched pages; **116** the titles follow
the source; **117** the seven author's calls of 2026-11-08 ratified as amended here:

- The cover is a `generated` card when it holds model text: it opens with the rule-generated verdict (never accented
  itself) and continues with the model's first section; with the verdict alone it is a plain card.
- The review date, its reason and `proposal.risks` live on «Rischi e revisione»: the proposal page keeps its base
  sentence only (The One-Tile-One-Question Rule).
- The eyebrow is the `<h2>` and the title a `<p tabIndex={-1}>`, as the path's screens; on the cover the verdict's own
  `<h2>` is the heading, the eyebrow a `<p>`, and the focus target is the `<div>` around the verdict.
- The page is remembered by id (criterion 6); a revision keeps the reader where the request was made.
- The Wizard's turn mechanics become `useSceneTurn`, the book its second consumer: a stateful hook with a focus side
  effect is extracted at the second use, because a drift between two copies would be a behaviour bug.
- No arrow keys and no swipe turn the CARD (§ 10): a textarea and radios live on pages; the arrows move inside the
  rail only (decision 111).
- The «Indice» button is `desktop:hidden`: at 1440 the rail's labels are the index.

## 4. Solution

### 4.0 The mock, the first step of the implementation (decisions 92, 101)

Before any component: the `impeccable` skill with DESIGN.md as the normative layer (DESIGN.md is never regenerated; a
user-pinned direction beats the concept seed), WITHOUT its critique command (no snapshot is written, so the step runs
on any machine), produces ONE static file `.tmp-libro.html` at the repo root — never committed, deleted in phase G —
of FIVE views on invented figures (the E2E fixture's names: «ETF ornitorinco», «Fondo fenicottero», 70 / 30, «meno
cripto»): `copertina` at 1440 with the rail's labels as buttons and the current one marked; `strumenti` at 390 (the
eyebrow row, the title, the reading, the section's text, the sleeves, the footer: «Avanti» full width, then
«Indietro» · «Indice»); `modifica` at 390 with a round asked (the footer: «Rivedi il report», «Salta le domande»,
«Avanti», then «Indietro» · «Indice»); `applica` at 390 (the footer: «Applica alle impostazioni», «Rifai il percorso»,
then «Indietro» · «Indice»); the «Vai a una pagina» drawer open at 390. Light and dark. `npx impeccable detect
.tmp-libro.html` reports zero `low-contrast` and zero `design-system-*`. The owner is shown the ten screenshots (five
views × two modes, saved in the scratchpad) and answers with AskUserQuestion; a change he asks is a numbered decision
in README.md § 3 AND a rewrite of the line of this spec it touches, BEFORE the code (a mock that diverges from the
spec is a finding for the spec, never a licence for the code); the mock is redrawn ONCE at most, and a second round
of changes goes to the spec alone. The mock's figures and names are never the owner's.

### `lib/utils/allocationAdviceBook.ts` (new, pure, no zod, no React)

```ts
export type BookPageId = 'copertina' | 'allocazione' | 'strumenti' | 'obiettivi' | 'ruoli' | 'passi' | 'rischi' | 'report' | 'colloquio' | 'modifica' | 'applica';
export type BookTextSource = 'report' | 'strategy';
export interface BookPageSpec { id: BookPageId; title: string; aliases: readonly string[]; generated: boolean }
/** The ten pages in reading order; `report` is not here — `buildBookPages` inserts it after `copertina` in the degenerate book. */
export const BOOK_PAGE_TABLE: readonly BookPageSpec[];
export const BOOK_COVER_TITLE: Record<BookTextSource, string>;  // { report: 'In una frase', strategy: 'La situazione' }
export const BOOK_REPORT_TITLE: Record<BookTextSource, string>; // { report: 'Il report', strategy: 'La strategia' }
export function normalizeHeading(text: string): string;
export interface ReportSection { heading: string; level: number | null; shape: 'atx' | 'bold' | 'inline'; body: string }
export function splitReportSections(markdown: string): { preamble: string; sections: ReportSection[] };
/** The text of each page (criterion 2); `null` when the matched headings land on fewer than two pages. */
export function assignSections(split: { preamble: string; sections: ReportSection[] }, coverTitle: string): Map<BookPageId, string> | null;
export interface BookPageInput {
  markdown: string | null; source: BookTextSource | null;
  hasProposal: boolean; hasInstruments: boolean; hasGoals: boolean; hasRoles: boolean; hasInterview: boolean; hasReport: boolean;
}
export interface BookPage { id: BookPageId; title: string; text: string | null; generated: boolean }
export function buildBookPages(input: BookPageInput): BookPage[];
export function bookIndexOf(pages: readonly BookPage[], id: string | null | undefined): number; // 0 when unknown
export function turnDirection(from: number, to: number): 1 | -1;
export const BOOK_PAGE_PARAM = 'pagina';
/** `pathname` + the query with `pagina` set (removed when `id` is null or 'copertina'), `rivedi` removed, the rest kept; never ''. */
export function bookPageUrl(pathname: string, search: string, id: BookPageId | null): string;
```

`splitReportSections` skips fenced blocks (```` ``` ```` or `~~~`) whole and records every candidate line of the three
shapes of criterion 2 (an inline candidate only when its bold equals an alias; its `body` starts with the rest of the
line); a blank `markdown` gives an empty split. `assignSections` decides the section level (criterion 2), walks the
sections in order with a cursor page (`copertina` at start) — a match moves the cursor, the section is appended to
the cursor's text, the heading line dropped or re-emitted as `## ` by the rule of criterion 2, a non-section ATX
heading left verbatim in its body — and returns `null` when fewer than two different pages were matched.
`buildBookPages`: `text` per page from `assignSections`; `null` → the degenerate book (the cover's `text` null, the
`report` page with the whole markdown and `BOOK_REPORT_TITLE[source]`); the cover's title `BOOK_COVER_TITLE[source ??
'report']`; the existence rules of criterion 1; `generated` from the table, and for the cover `text !== null`.

### `lib/utils/allocationAdviceNarrative.ts` (+ `BOOK_COPY`, two sentences)

```ts
export const BOOK_COPY = {
  eyebrow: (n: number, total: number, title: string) => `Pagina ${n} di ${total} · ${title}`,
  back: 'Indietro', next: 'Avanti', index: 'Indice',
  indexEyebrow: (total: number) => `Il report · ${total === 1 ? '1 pagina' : `${total} pagine`}`,
  indexTitle: 'Vai a una pagina',
  indexReading: "Ogni pagina si legge da sola; «Applica» è l'ultima.",
  reviewAside: (date: string) => `rivedi entro il ${date}`,
  instrumentsTextOnly: 'La ricerca ha scritto solo testo: è quello di questa pagina.',
} as const;
```

Strings only: the module is imported by the Allocazione page (`describeReviewBy`) and stays zod-free.
`buildConsulenteVerdict`'s two sentences (`:191`, `:199`) are rewritten as criterion 8 writes them.

### `components/ui/path-rail.tsx` (+ `mode: 'book'`)

```ts
| { mode: 'book'; pages: readonly { id: string; title: string }[]; current: number; interactive: boolean; onSelect: (index: number) => void }
```

`BookList` (a component, so it may call `useRovingFocus`): `<ol aria-label="Le pagine" {...containerProps}>`; with
`interactive` each `<li>` holds `<button type="button" {...itemProps(i)} aria-current={isCurrent ? 'page' : undefined}
onClick={() => onSelect(i)} className="flex w-full min-w-0 items-center gap-2 text-left min-h-8
[@media(pointer:coarse)]:min-h-11 …">` with the tick (`STRIP_TICK_CLASS`, `bg-foreground` current, `bg-foreground/50`
before it, `bg-border` after) and the label (`NAME_CLASS`); without it a plain `<li>` with `aria-current="page"` on
the current. `PathRail` renders the book branch inside ITS OWN `<nav aria-label="Dove sei" className={cn(STRIP_CLASS,
'desktop:pt-1')}>`, exactly as the path branch: the host renders `<PathRail>` bare. The file's header comment replaces
«The ticks are not buttons and carry no handler» with: «In the path and the run the ticks are not buttons and carry no
handler. In the book the rail IS a control from `desktop:` (2026-11-08): the labels are buttons, one Tab stop; below it
the ticks stay 4px and the «Indice» button is the jump.»

### `components/allocation/consulente/useSceneTurn.ts` (new; extracted from `ConsulenteWizard.tsx:191-205`)

```ts
export function useSceneTurn<T extends HTMLElement>(target: React.RefObject<T | null>): {
  direction: 1 | -1;
  /** Remembers the focused element (or, with `always`, that the focus must move anyway), sets the direction, then runs `effect`. */
  move(toward: 1 | -1, effect: () => void, options?: { always?: boolean }): void;
  /** For `onAnimationComplete`: focuses `target` with `preventScroll` when `always` was asked, or the focus is still where the gesture left it, or on `body`. */
  focusTarget(): void;
}
```

The hook owns `direction` (state) and `pending` (a ref written in `move`, read and cleared in `focusTarget`); it
returns no ref. The Wizard keeps `const headlineRef = useRef<HTMLParagraphElement>(null)` (it still hands it to
`ConsulenteInterviewScene`), calls `useSceneTurn(headlineRef)`, and replaces its `direction` state, its `pendingFocus`
ref and its two functions with the hook: `move(toward, action)` becomes `move(toward, () => dispatch(action))`,
`focusHeadline` becomes `focusTarget`. No behaviour change.

### `components/allocation/consulente/ConsulenteBook.tsx` (new), `ConsulenteBookPages.tsx` (new) and the bodies

**What moves where.** `ConsulenteReport.tsx` keeps: the running view (`:182-197`), the data hooks and plans
(`:114-129`), `useConsulenteRevision`, the apply state and `apply()` (`:131-180`), `markApplied`. Its column
(`:199-423`) is replaced by `<ConsulenteBook …>`. `ProposedPct`, `MARKDOWN_COMPONENTS`, `ROLE_LABEL` and the
once-flags (`consulenteReportEntrance`, now `{ cascade: false, countUp: false }`) MOVE to `ConsulenteBookPages.tsx`,
so the book never imports `ConsulenteReport.tsx` (no import cycle). `ConsulenteBookPages.tsx` exports hook-free
builders that return the pieces of a page —

```ts
export interface BookPagePieces { aside: React.ReactNode; reading: Narrative | null; body: React.ReactNode; footnote: React.ReactNode }
export function proposalPieces(rows: ProposalClassRow[], countUp: boolean): BookPagePieces;
export function instrumentsPieces(instruments: NonNullable<AllocationAdviceDocument['instruments']>): BookPagePieces;
export function goalsPieces(proposal: AllocationProposal): BookPagePieces;
export function rolesPieces(roles: ReturnType<typeof planRoleChanges>): BookPagePieces;
export function risksPieces(proposal: AllocationProposal): BookPagePieces;      // new: the review aside, the reason, the risks rows
export function applyPieces(input: ApplyPiecesInput): BookPagePieces;           // the checkboxes, the warnings, the status line
export function modelAside(document: AllocationAdviceDocument): string | null;  // «{model} · {date}» of the text's source
```

— each the former tile's JSX without its `Tile` (the types named as the code names them today).
`ConsulenteInterviewTile.tsx` exports `InterviewBody({ interview })` (the rounds' column, `:38-46`) beside
`InterviewRoundRows`, and `ConsulenteInterviewTile` is deleted; `__tests__/consulenteInterviewTile.test.tsx` renders
`InterviewBody` with the same assertions. `ConsulenteRevisionTile.tsx` exports
`useRevisionDraft(ownerId, document, revision)` — the tile's state (`request`, `round`), its `useConsulenteInterview`,
its handlers and derived values (`:48-103`), returned as `{ request, setRequest, round, last, answer, asking, revising,
status, primary, showSkip, skipQuestions, requests, lastRevisionRound }` — and `RevisionBody({ draft })` (the requests,
the textarea, the skeleton, the round, the status line: `:107-135`); `ConsulenteRevisionTile` is deleted. BEFORE the
split, `__tests__/consulenteRevisionTile.test.tsx` is written against the tile as it is (the harness of
`__tests__/assistantCompanionScene.test.tsx`: `QueryClientProvider`, the mocked `authFetch`, `waitFor`) — a request
typed enables «Rivedi il report»; a round with questions shows the cards and «Salta le domande»; a round without
questions sends the revision at once; «Salta le domande» sends `skipped: true` — and seen green; after the split the
same assertions run on a test host that calls the hook and renders `RevisionBody` and the two buttons.

**The book** (`ConsulenteBook`, props: `ownerId`, `document`, `verdict`, `proposal`, `rows`, `roles`, `goalPlan`,
`revision`, the apply props, `pageId: string | null`, `onPageChange(id: BookPageId)`, `onRedo`):

- state: `indexOpen: boolean`; `turned: boolean` (false until the first turn of this mount); `const [plays] =
  useState(() => ({ cascade: !consulenteReportEntrance.cascade && reduced !== true, countUp:
  !consulenteReportEntrance.countUp && reduced !== true }))`; `const targetRef = useRef<HTMLElement>(null)`; `const
  cardRef = useRef<HTMLElement>(null)`; `useSceneTurn(targetRef)`; `const draft = useRevisionDraft(ownerId, document,
  revision)`; `const compact = useCompactLayout()`.
- `pages = buildBookPages({...})` from the flags of criterion 1; `index = bookIndexOf(pages, pageId)`; `page =
  pages[index]`.
- the once-flags are written in effects, never in render: `useEffect(() => { consulenteReportEntrance.cascade = true },
  [])`, and `consulenteReportEntrance.countUp = true` in an effect of the component that renders the proposal page's
  body on screen (`ProposedPct` reads `plays.countUp`, decided before the flag is written, and `useCountUp`'s `once`
  keeps a remount from replaying).
- `turnTo(next: number, options?: { always?: boolean })`: returns at once when `next === index`; otherwise, in the
  handler: the scroll of criterion 3 (`cardRef.current`, `document.getElementById('page-main')`), then `move(
  turnDirection(index, next), () => { setTurned(true); onPageChange(pages[next].id);
  window.history.replaceState(null, '', bookPageUrl(window.location.pathname, window.location.search, pages[next].id)); },
  options)`. A row of «Indice» calls `setIndexOpen(false)` and `turnTo(i, { always: true })`.
- render: `<div className={cn(SCENE_GRID_CLASS, 'print:hidden')} data-consulente-report="">` → `<PathRail mode="book"
  pages={pages} current={index} interactive={!compact} onSelect={turnTo} />` → `<section ref={cardRef}
  aria-label={BOOK_COPY.eyebrow(index + 1, pages.length, page.title)} data-generated={page.generated ? '' : undefined}
  className={cn(TILE_SURFACE_CLASS, SCENE_CARD_CLASS, 'scroll-mt-4 desktop:scroll-mt-5', page.generated &&
  AI_GENERATED_SURFACE_CLASS)}>` → `<AnimatePresence mode="wait" custom={direction}>` (NO `initial={false}`: it would
  block the cascade) → `<BookPageSlide key={page.id} …>`.
- `BookPageSlide` (a component in the same file, so it may read `useIsPresent()`): `<motion.div data-scene={page.id}
  data-turn={direction === 1 ? 'forward' : 'back'} inert={!isPresent} custom={direction} variants={reduced ?
  sceneVariantsReduced : sceneVariants} initial={turned ? 'enter' : false} animate="center" exit="exit"
  onAnimationComplete={(d) => d === 'center' && focusTarget()}>` → the cascade wrapper `<motion.div
  variants={staggerContainer} initial={!turned && plays.cascade ? 'hidden' : false} animate="visible">` → the blocks,
  each a `motion.div variants={cardItem}`: the eyebrow row, the headline (`ref={targetRef}` on the `<p>`, or on the
  `<div>` around `PageVerdict` on the cover), the reading, the text, the figures, the footnote, the pager footer.
- «Indice»: `<ResponsiveModal open={indexOpen} onClose={() => setIndexOpen(false)} returnFocusTo={targetRef}
  eyebrow={BOOK_COPY.indexEyebrow(pages.length)} title={BOOK_COPY.indexTitle} reading={BOOK_COPY.indexReading}>` with
  the `<ol>` of criterion 4. `returnFocusTo` and the slide's `focusTarget` name the same element, so whichever lands
  last leaves the focus on the new page's headline.
- the footer: `<div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 tablet:flex-row tablet:items-center
  tablet:justify-between">`; first in the DOM the page's buttons (`flex flex-col gap-2 tablet:order-2 tablet:flex-row`,
  the DOM order of criterion 4's phone column, re-ordered from `tablet:` with `tablet:order-*` so the row reads as
  criterion 4 writes it), then `<div className="grid grid-cols-2 gap-2 tablet:order-1 tablet:flex">` «Indietro» ·
  «Indice». «Rifai il percorso» calls `onRedo`.
- `<ConsulenteBookPrint …>` after the grid: `<div data-book-print="" className="hidden print:block">` → the
  `PageVerdict`, then for every page but `modifica` and `applica` a `<section className="mt-6 break-inside-avoid-page">`
  with `<h2>` (the title, `TILE_EYEBROW_CLASS`), the aside, the reading, the text and the same pieces
  (`proposalPieces(rows, false)`, `InterviewBody`, …). No motion component, no `generated`.

### `app/globals.css` (the printer's shell, scoped)

```css
@media print {
  html:has([data-book-print]) :is(body, body *):has(#page-main) { display: block; height: auto; min-height: 0; overflow: visible; }
  html:has([data-book-print]) :is(body, body *):has(#page-main) > :not(:has(#page-main)):not(#page-main) { display: none; }
  html:has([data-book-print]) #page-main { overflow: visible; height: auto; padding: 0; }
}
```

Every ancestor of `#page-main` becomes a plain block, every sibling of those ancestors (the sidebar, the bottom
navigation, the demo banner) is removed, and nothing applies on a page without a print sheet.

### `ConsulenteClient.tsx` and `page.tsx`

`page.tsx` reads `params.pagina` (a string; an array or undefined → null) and passes `initialPage`. `ConsulenteClient`
holds `const [bookPage, setBookPage] = useState<{ id: string; createdAt: number } | null>(null)` and derives, for the
document on screen (`created = advice.createdAt.getTime()`): `pageId = bookPage?.createdAt === created ? bookPage.id :
created <= openedAt && !startFresh ? initialPage : null`. It passes `pageId` and `onPageChange={(id) => setBookPage({
id, createdAt: created })}` to `ConsulenteReport` → `ConsulenteBook`; `onRedo` becomes `() => { setRedo({
documentUpdatedAt: advice.updatedAt.getTime() }); setBookPage(null); window.history.replaceState(null, '',
bookPageUrl(window.location.pathname, window.location.search, null)); }`. No effect, no `useSearchParams`.

### `e2e/consulentePath.ts` and `e2e/consulenteReport.ts`

`openConsulente` (`:21-25`) stops pressing «Rifai il percorso»: it waits for `step1.or(page.locator(
'[data-consulente-report]')).or(redo)`; when the book is visible it goes to
`/dashboard/allocation/consulente?rivedi=1`; when «Ricomincia il percorso» is visible (the running view) it presses
it; then it waits for «Passo 1 di 8». `plant`, the restore of the held document and `openReport` move from
`report.spec.ts` to a new helper `e2e/consulenteReport.ts`, shared by `report.spec.ts` and `book.mobile.spec.ts`;
`plant` takes the variant (`'headings' | 'plain'`).

### DESIGN.md § 5 → AI Surfaces (hand-written; the owner approved this text with decision 117)

- The Path-Scene Rule: «and no tick is a button» becomes «and in the path and the run no tick is a button», and after
  the rail's sentence: «**In the book** (the report read page by page, 2026-11): from `desktop:` the rail's labels ARE
  buttons — one Tab stop, the current page `aria-current="page"` — and below it «Indice» opens a modal of 44px
  rows, «Vai a una pagina»; the pager is the card's footer, «Indietro» / «Avanti», and the whole page slides, the one
  that leaves `inert`; a page is an address (`?pagina=`); the text of the model's report is split by its sections
  onto the page of the tile it explains.»
- The AI-Accent Rule: «every tile of the Consulente's report except «Applica», «Chiedi una modifica» and «Il
  colloquio»» becomes «every page of the Consulente's report whose body is the model's — the cover included when it
  carries model text, which opens with the never-accented verdict — and never «Applica», «Chiedi una modifica», «Il
  colloquio»»; «the report tiles' eyebrows» becomes «the eyebrows of those pages».
- The motion table: «Report, entering» → «Report, the first page shown»; «Figures (the proposed percentages)» → «…, on
  the proposal page's first mount».
- `.impeccable/design.json`: the same three rewrites in the bodies of the two rules and in the purpose of the motion
  entry «the Consulente's report entering…», applied by a script that asserts each old string occurs exactly once
  before replacing it (the sidecar is never rewritten by hand).

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **The Allocazione page's bundle** (doc/guide/consulente.md § Files: nothing the Allocazione page loads may reach
  zod) — here it means `allocationAdviceBook.ts` imports nothing but types and is imported by the book alone;
  `BOOK_COPY` is strings in the narrative; `perf:budget`'s `/dashboard/allocation` entry measures it (criterion 13).
- **AGENTS.md § React Compiler and the hooks rules** — here it means the direction, the page id, `turned` and the
  index's open state are `useState`; `pending` is a ref written in `move` and read in `focusTarget` only; a hook never
  returns a ref; the once-flags are written in effects; no `try … finally`; `replaceState` and `scrollIntoView` in the
  handler, never in an effect (`react-hooks/set-state-in-effect` and «a request belongs to the click» both).
- **framer-motion 12** — here it means no `initial={false}` on the book's `AnimatePresence` (it blocks the initial
  animation of every descendant on the first render, the cascade included): the first page's stillness is the sliding
  wrapper's own `initial={false}`, and the cascade wrapper states its own `initial`. An exiting child is rendered
  with its last props, so `inert` comes from `useIsPresent()` inside the child.
- **Hydration** — here it means the first page comes from the server param (`initialPage`), never from
  `window.location` in render; the book mounts after the auth wait, so `useCompactLayout()` answers the real width on
  its first render and the rail never swaps.
- **AGENTS.md § Accessibility** — here it means one `h2` per page (the eyebrow, or the verdict's on the cover), the
  focus moved after a turn with `preventScroll`, `aria-current="page"` on the rail's and the index's current item,
  a list of like controls as ONE Tab stop (the rail), the index rows ≥ 44px, the footer's buttons `h-11` below
  `desktop:`, the modal through `ResponsiveModal` with `returnFocusTo` (its opener unmounts with the page that slides
  away).
- **The focus target lives inside the sliding page** — here it means `targetRef` is never put on the `<section>`: the
  page that leaves would null it on unmount after the new page had set it.
- **The One-Tile-One-Question Rule** — here it means the review date and its reason are figures on `rischi` alone;
  the proposal page's footnote keeps the base sentence only; the verdict keeps its own date, as today.
- **The heading reader never trusts the model** — here it means the aliases are the contracts' titles, every
  unmatched section lands on the previous page (nothing is dropped), fenced blocks are skipped, and a text the
  reader cannot split onto two pages is still read whole (the `report` page). **Structure is never parsed from
  prose** (README.md § 8) is not touched: the reader only decides WHERE the model's prose is shown; no figure, no
  write and no decision of the app is taken from it.
- **`ReactMarkdown`'s components map stays module-level** — here it means `MARKDOWN_COMPONENTS` moves to
  `ConsulenteBookPages.tsx` as a module constant, exported.
- **The E2E fixture is the fake document of `report.spec.ts`** (two classes, one goal, two rounds, one request) — here
  it means its markdown gains the seven headings so the split is exercised (variant `headings`), and a second planted
  variant without headings exercises the `report` page (variant `plain`).
- **jsdom has no CSS** — here it means `consulenteBook.test.tsx` queries inside the card (`within(card)`): the print
  sheet is in the DOM and repeats every title and figure.
- **A probe never opens a control that spends** — «Rivedi il report» on page 9 runs on the faked route.
- **No owner data in a tracked file** — the mock, the fixtures and the screenshots use the invented names.
- **No decision number and no spec name in the code** (README.md § 8): a comment cites the date («2026-11-08»).

## 6. Tests per level (with the mutation that proves each)

- `__tests__/allocationAdviceBook.test.ts` (new): `normalizeHeading` (accents, numbers, bold, apostrophes, «**1.
  Gli strumenti**» → «gli strumenti»); `splitReportSections` (the three shapes, fenced skipped, preamble, blank);
  `assignSections` (criterion 2's cases); `buildBookPages` (criterion 1's four documents, the two degenerate cases,
  the titles by source, the cover's `generated`); `bookIndexOf` (unknown → 0); `turnDirection`; `bookPageUrl`
  (criterion 5's four cases). Mutations: as in criteria 1, 2, 5.
- `__tests__/allocationAdviceNarrative.test.ts`: `BOOK_COPY.eyebrow(3, 10, 'Gli strumenti')` = «Pagina 3 di 10 · Gli
  strumenti»; `indexEyebrow(1)` «Il report · 1 pagina», `(10)` «… 10 pagine»; the two verdict sentences of criterion 8.
- `__tests__/pathRail.test.tsx`: book mode with and without `interactive` (criterion 4), the landmark, the roving Tab
  stop, the two floor classes, `onSelect(index)` on click; the path and run modes unchanged.
- `__tests__/useSceneTurn.test.tsx` (new): `move` sets the direction and remembers the active element; `focusTarget`
  focuses when the active element is the remembered one or `body`, not when the user moved it, and always with
  `always`.
- `__tests__/consulenteRevisionTile.test.tsx` (new, § 4: written before the split, then on the host).
- `__tests__/consulenteInterviewTile.test.tsx`: the same assertions on `InterviewBody`.
- `__tests__/consulenteBook.test.tsx` (new; the harness of `assistantCompanionScene.test.tsx`: a `matchMedia` stub
  for `useCompactLayout`, `QueryClientProvider`, the mocked `authFetch`; every assertion after a turn inside
  `await waitFor(…)`, which is how the slide's exit and the focus settle in jsdom): criteria 3–8 and 14 as their
  proofs say, `data-generated` per page, the document change (criterion 6).
- `__tests__/useConsulenteRun.test.tsx`, `consulenteRun.test.tsx`: unchanged and green.
- `__tests__/reactCompilerCoverage.test.ts`: green (criterion 12).
- E2E: `e2e/allocation.consulente.report.spec.ts` rewritten page by page (criteria 4, 5, 7, 8, 9, 10, 14); new
  `e2e/allocation.consulente.book.mobile.spec.ts` at 390 (criterion 3's three probes, the drawer and its rows ≥ 44px,
  the footer of `strumenti` and of `applica`, reduced motion: the page appears in place and the headline takes the
  focus); `e2e/consulentePath.ts` and the new `e2e/consulenteReport.ts` (§ 4); `allocation.consulente.spec.ts`,
  `.interview.spec.ts`, `.interview.mobile.spec.ts`, `.mobile.spec.ts` green on the new `openConsulente` (the Wizard's
  refactor). Every spec on the emulators, the route faked where a model would be called.

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the fifteen criteria; the outcome «the report is a book of up to ten pages, each the model's section with
  the figures of its tile, turned from the footer, jumped to from the rail at 1440 and from «Indice» below, each an
  address; «Applica» closes it; a printer gets it whole».
- **B**: the MOCK of § 4.0 read with the owner (the five views, light and dark) BEFORE the code; then `BOOK_COPY`, the
  page titles and the three rewritten sentences read aloud.
- **C**: `node ~/.claude/processi-collaudo.mjs` at zero before the gate; `node -v` on 24; `npx tsc --noEmit`; `npm run
  lint`; Vitest whole under `TZ=Europe/Rome`, in the machine's zone and under `TZ=UTC`; with the emulators up, `npx
  playwright test e2e/allocation.consulente.spec.ts e2e/allocation.consulente.interview.spec.ts
  e2e/allocation.consulente.interview.mobile.spec.ts e2e/allocation.consulente.mobile.spec.ts
  e2e/allocation.consulente.report.spec.ts e2e/allocation.consulente.book.mobile.spec.ts`; `npm run perf:budget`
  before and after (criterion 13), the Consulente route's initial JS before and after in SESSION_NOTES.
- **D**: no server code changes; the planted documents of the two E2E specs are the data check (a report with the
  seven headings, one without).
- **E**: screenshots in the scratchpad (never committed), faked route, light and dark: every page at 390 and 1440,
  the «Vai a una pagina» drawer at 390 and at 768 and the dialog at 1024 (`ResponsiveModal` is a drawer up to 768),
  the rail with the current label at 1440, the failed document's cover, the print sheet as a PDF (`page.pdf()`); the
  height of each page at 390 noted in SESSION_NOTES (the fixture's, not a user's).
- **F** (decision 100): at the owner's «pronto», in the implementation session, never on the PR's preview (demo
  only): `npm run mirror:seed -- <email>`, then the owner walks ONE real path on the mirror — the screens, the
  interview, the run on his own key, the only spend of the session — and reads the book on the phone and at 1440:
  whether each page «ha un senso logico da sola», whether the split put each section where he expects it (the first
  time the reader meets headings a model really wrote: the shapes seen are noted in SESSION_NOTES, and a shape that
  fell to the `report` page is a finding fixed in the session), whether the rail and «Indice» are enough to find
  «Applica». «Applica alle impostazioni» is pressed only on the owner's word. `npm run mirror:remove` after.
- **G**: `.tmp-libro.html`, the screenshots and every throwaway deleted; the mirror removed; `SESSION_NOTES.md` not
  committed.

## 8. Putting it into service

Branch `feat/consulente-libro`, commit `feat(consulente): the report as a book — one page per section and tile, the
rail as the index, a page as an address`, PR to `develop`. No flag: the column is replaced.

## 9. Documentation

- `doc/guide/consulente.md`: § Files — `ConsulenteReport.tsx` «(verdict, tiles, markdown, «Applica»)» becomes «(the
  running view, the data, «Applica»'s writes; the book is `ConsulenteBook.tsx`, its page bodies
  `ConsulenteBookPages.tsx`, the turn `useSceneTurn.ts`)», `ConsulenteInterviewTile.tsx` «(`InterviewBody`)»,
  `ConsulenteRevisionTile.tsx` «(`useRevisionDraft`, `RevisionBody`)»; Primitives — `PathRail` «the path's eight
  ticks, the interview's three, the run's four segments, the book's pages (buttons from `desktop:`)»; Pure gains
  `allocationAdviceBook.ts` (the page table, the heading reader, the address); the suites gain `allocationAdviceBook`,
  `consulenteBook`, `consulenteRevisionTile`, `useSceneTurn`; Browser gains `allocation.consulente.book.mobile.spec.ts`
  and the helper `e2e/consulenteReport.ts`. § The report and «Applica» is renamed **§ The report as a book** and
  rewritten: the ten pages and their existence rules, the split (the three shapes, the aliases, the fallback, the
  degenerate book), the pager (the footer, the rail from `desktop:`, «Indice»), the address, the accent per page, the
  motion (the first page's cascade, the proposal page's count-up), «Chiedi una modifica» as page 9 with everything the
  bullet says today — «The tile under «Il report»» becomes «the page before «Applica»», «the round lives in the
  tile's memory (`ConsulenteRevisionTile`)» becomes «the round lives in the book's memory (`useRevisionDraft`): it
  survives a turn, not a reload» —, «Il colloquio» as its page, «The tiles» bullet as the pages, «Applica» as the
  last page, the print sheet; the owner's words of 2026-11-08 quoted once. § The visual direction: «the report's
  cascade» becomes «the first page's cascade», and «§ The report and «Applica»» follows the rename. § Composizione
  mobile adds «the book is not a composed page either: one card, one page at a time; «Indice» is the one
  `ResponsiveModal` of the route». § Per-page blind spots — rewritten: «The report reaches neither the PDF nor the
  emails» loses its last two sentences (the review date and the risks have their page; the book is this guide's
  § The report as a book) and gains «it prints from the browser, every page but the two that act»; «Before the date,
  «Rifai il percorso» at the bottom anticipates it» becomes «…on the last page…»; «The ticks are not buttons» becomes
  «The path's ticks are not buttons… ; the book's labels are, from `desktop:`»; «The revision's round lives in the
  tile's memory» becomes «…in the book's memory: a turn keeps it, a reload before «Rivedi il report» loses it, and its
  slot». Added: «A heading the model invents lands on the previous page, never lost, never its own page» · «A report
  the reader cannot split onto two pages is one page «Il report» after a cover with the verdict alone» · «`?pagina=`
  is ignored with `rivedi=1`, and a turn removes `rivedi`» · «A new report opens on its cover whatever `?pagina=`
  says» · «The count-up plays on the proposal page's first mount in the session, not on the cover» · «Copy and the
  browser's find see the open page only; the print sheet holds every page».
- `DESIGN.md` § 5 → AI Surfaces and `.impeccable/design.json`: § 4's rewrites; the two rules' «Implemented on» lines
  gain «the report as a book on 2026-11-NN (PR #NNN)» with the real date and number. `DESIGN.md:661` «40 mounts in 39
  files» becomes the count `grep -rn '<ResponsiveModal' components app` gives after the change (42 mounts in 41
  files on today's tree plus «Indice»).
- `AGENTS.md` § Allocazione › Consulente: the first bullet gains «; the report is read as a book of up to ten pages,
  the model's text split by section onto the page of its tile, the rail its index from `desktop:` (2026-11)».
- `CLAUDE.md`: § Key Features › Allocazione › Consulente adds «the report read as a book (2026-11)»; § Dialogs and
  forms «40 modals» becomes «42 modals»; «Latest» is rewritten for this PR. `doc/guide/dialog.md` (`:177`, `:199`,
  `:214`): «40» becomes «42», and its list of modals gains «Vai a una pagina».
- `doc/guide/velocita.md` § Registro dei tetti alzati: a row ONLY when criterion 13 raised a ceiling.
- `Draft Release Temp.md`: the «Allocazione — Consulente» entry is REWRITTEN to its final state (one entry per
  surface): its sentence about the report («…and a report with the proposal against today, the instruments per
  sub-target, …») now says the report reads as a book — one page per step, the Consulente's words and the figures
  they explain, turned from the bottom of the page, an index to jump to any page, «Applica» as the last one, and a
  print of the whole —; the sentence «The report's shape as a book — one page per section — is written down as the
  next step of the series.» of the guide's entry is deleted.
- `doc/ai/README.md` § 6: AI-07's row «implemented on …, PR #… in develop since …».

## 10. Declared out of scope

- Swipe and arrow keys to turn the card: the path has neither, and a textarea and radios live on pages.
- A PDF or an email of the report made by the app: none exists today (§ 1), and none is added; the print sheet is the
  browser's.
- Copying the whole report and the browser's find across pages: one page is in the visible DOM.
- The Allocazione's «Rivedi con il Consulente» pointing at a page: it opens the screens (`?rivedi=1`) by design.
- A memory of the last page across sessions (localStorage): the address is the memory.
- The strategy's and the review's contracts: unchanged — the book reads what they already prescribe (decision 102).
- A stale `?pagina=` left in the address by a document that lost that page: the first page shows, and the next turn
  rewrites the address.

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Allocazione › Consulente, § React Compiler and the hooks rules, § Accessibility,
§ Commands), DESIGN.md § 5 «AI Surfaces» (The Path-Scene Rule, The AI-Accent Rule) e «Modal (a Tile lifted off the
page)», doc/guide/consulente.md, doc/guide/dialog.md, doc/guide/e2e-playwright.md, doc/guide/velocita.md (§ Registro
dei tetti alzati), doc/ai/README.md § 3-4-7-8, doc/ai/AI-07-report-libro.md. Node 24 (`node -v`). PRIMA del codice il
mock della § 4.0: `.tmp-libro.html` nella root (mai committato), skill impeccable senza critique, DESIGN.md normativo,
cifre inventate, `impeccable detect` pulito; mi mostri i dieci screenshot e aspetti il mio OK; una modifica che chiedo
diventa una decisione in README § 3 e una riga riscritta della spec, poi il codice segue la spec; un solo ridisegno.
Implementa AI-07 così com'è scritta: allocationAdviceBook.ts puro (la tabella delle pagine, il lettore delle tre forme
di intestazione, il libro degenere, l'indirizzo); PathRail mode 'book' con il suo nav e un solo Tab stop; useSceneTurn
estratto dal Wizard, che riceve il ref, senza cambiare comportamento; il test di ConsulenteRevisionTile scritto PRIMA
di dividerla; ConsulenteBook con la card della scena, tutta la pagina che scorre e quella che esce inert, il footer,
«Vai a una pagina» su ResponsiveModal, ?pagina= con replaceState dal gesto e l'id della pagina in ConsulenteClient,
la bozza della modifica che sopravvive al giro, lo scroll in cima alla card; i corpi delle tessere spostati in
ConsulenteBookPages, non riscritti, salvo le tre frasi della decisione 110; i rischi e la data di revisione sulla
pagina «Rischi e revisione»; il foglio di stampa e la regola di globals.css limitata a `:has([data-book-print])`;
openConsulente e l'helper e2e/consulenteReport.ts. Test: le suite della § 6, Vitest nelle tre zone (Europe/Rome,
quella della macchina, UTC), le sei spec Playwright del Consulente con la route SEMPRE finta, reactCompilerCoverage e
lint verdi, perf:budget prima e dopo, il JS iniziale della route prima e dopo col metodo di doc/guide/velocita.md.
Fermati e chiedimi se: `/dashboard/allocation` supera il tetto di 604 (criterio 13); un contratto del percorso
(PR #507) o del colloquio (PR #509) nel codice, o una regola di DESIGN.md § 5, differisce da quello citato nella § 4;
una suite verde prima di te diventa rossa per un motivo fuori da questa spec. Collaudo: § 7; la F sul mirror con UN
percorso vero fatto da me con la mia chiave, al mio «pronto», poi mirror:remove. Un branch, un commit, solo dopo il
mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **high**. Estimated size: 1 session, ~7 h; ~230 lines pure (`allocationAdviceBook`), ~50
`path-rail`, ~35 `useSceneTurn`, ~320 `ConsulenteBook` with the print sheet, ~200 moved into `ConsulenteBookPages`,
~600 tests, one E2E spec rewritten, one new, two helpers.
