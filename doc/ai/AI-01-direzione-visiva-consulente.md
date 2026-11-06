# AI-01 — The visual direction

> Series `doc/ai/` (README.md § 5). **Runs after AI-00** (retired on 2026-11-03, in develop since 2026-11-03, PR #497; the numeric order of README.md
> § 5), though it uses nothing of its diff; AI-03, AI-04, AI-05 and AI-06 depend on it. Written on 2026-11-01 from
> `develop` @ b9411a4d. Executes decision 3 (the concepts in a spec of their own), decision 14 (the Consulente's
> scope: path, interview, run, report), decision 15 (`--ai-accent` on the AI surfaces) and decision 26 (the Assistente
> page, in register mode and in one analysis mode, is drawn too). **No app code changes in this session**: its
> deliverables are three concepts on one Design canvas and in `doc/ai/reference/`, one choice recorded as decision 74,
> and the DESIGN.md section «AI Surfaces» that AI-03..06 implement against. Read adversarially on 2026-11-01: 31
> findings applied, the decisions 21–73 in README.md § 3 (this spec: decisions 22, 26, 33, 34, 36, 37, 38, 44, 49, 50,
> 51, 53, 54, 55, 56, 57, 58, 60, 62, 64).

## 1. The problem today (evidence on the code)

- **The path has no scene**: `components/allocation/consulente/ConsulenteWizard.tsx` (471 lines @ b9411a4d) renders one
  card `TILE_SURFACE_CLASS mx-auto w-full max-w-[720px] p-5 desktop:p-6` (:202 @ ce26af4d), the eyebrow «Passo n di 8 ·
  {tema}» (:205 @ ce26af4d), a 24/30px headline, the fields and two buttons `h-11 desktop:h-9` (`BUTTON_CLASS`, :70 @
  ce26af4d). Changing screen swaps the content with no transition (`grep -c framer-motion
  components/allocation/consulente/*.tsx` → 0 in all four files). The eight screens read as one Settings form repeated
  eight times.
- **The run is a list without time**: `ConsulenteRun.tsx` (70 lines @ b9411a4d) is another 720px card, «Corsa del
  Consulente», with `<ol aria-label="Le fasi">` (:38 @ ce26af4d): each stage's label and what it reads
  (`STAGE_COPY[stage].detail`, `lib/utils/allocationAdviceNarrative.ts:97-102` @ ce26af4d), a spinner on the active one,
  «Riprova» on a failure (:63 @ ce26af4d), and no time at all. Nothing says how long a stage usually takes
  (doc/guide/consulente.md § The run holds the mirror's timings of 2026-10-20: strategy 2.6, instruments 2.7, review 1.7
  minutes).
- **The report is standard tiles**: `ConsulenteReport.tsx` (397 lines @ b9411a4d) renders, once ready, «Allocazione
  proposta» (:181), «Strumenti» (:216), «Obiettivi» (:259), «Ruoli degli asset» (:284), «Il report» (:303) — «La
  strategia» (:339) when the review has not run —, «Chiedi una modifica» (:313) and «Applica» (:349); while a document
  reads as running, «Le fasi» alone (:159), all @ ce26af4d. They are correct under every named rule and look like any
  other page's tiles: no named rule today tells text a model wrote from text the app computes.
- **The accent exists and is forbidden**: DESIGN.md:351 @ ce26af4d calls `--ai-accent oklch(0.65 0.2 305)` «Declared,
  not endorsed … the next surface that wants a hue for «AI» does not get one»; the frontmatter comment above the token
  (:68-71) cites a stale `page.tsx:220` and says «it is not a licence»; The Zero-Chroma Rule (:355) and The Data Owns
  Color Rule (:357) leave it no place. Its only use is the hover of «Analizza con AI» on Rendimenti
  (`app/dashboard/performance/page.tsx:299` @ b9411a4d: border, text and a `0_0_14px` 40% `color-mix` glow, over
  200 ms). `app/globals.css` sets the same value in `:root` (:96) and in `.dark` (:156) @ ce26af4d: as text on the light
  card it reads 3.5:1, under AA (the detector's `low-contrast`, § 6). Decision 15 overturns the sentence for the AI
  surfaces; decision 36 fixes how.
- **The Assistente's AI parts have no direction either**: its one AI card, `components/assistant/GoalProposalCard.tsx`
  (302 lines @ ce26af4d), is a `rounded-xl bg-muted/40` sub-tile (:179) with `h-9` buttons (:273, :290: 36px, under the
  44px floor of AGENTS.md § Accessibility); a message is flat under its «Tu» / «Assistente» sub-eyebrow
  (`components/assistant/AssistantStreamingResponse.tsx:165` @ ce26af4d); the send button «Invia messaggio» is a
  primary icon button (`components/assistant/AssistantComposer.tsx:100` @ ce26af4d). The Registra mode does not exist
  yet (AI-05).
- **Two copies of the choice rows** (`ChoiceRows` in `ConsulenteWizard.tsx:118` and
  `components/assets/compravendita/fields.tsx:22` @ b9411a4d): the primitive the interview and the chat need does not
  exist. AI-03 creates `ChoiceList`; this spec draws it.

## 2. Goal and acceptance criteria

The owner chooses a visual direction for the Consulente's four surfaces and for the Assistente page from three drawn
concepts, on invented figures, and the choice is written where AI-03..06 implement it without asking again.

1. **Three concepts, six scenes each, drawn and transcribed.** One Design canvas «Consulente e Assistente — direzioni
   visive» holds the three concepts of § 3 in three rows of six artboards — `path`, `interview`, `run`, `report`,
   `register` (Assistente › Registra), `analysis` (Assistente › Mese) — and `doc/ai/reference/` holds `concept-a.html`,
   `concept-b.html`, `concept-c.html` (the hand transcriptions of § 4) and `sample.json`. Proof: `ls doc/ai/reference/`
   prints the four files; on each page `grep -c '<section data-scene="'` → 6, `grep -c '<figcaption'` → 6, `wc -c` ≤ 61440 and
   `grep -c 'src="http\|href="http\|<link \|@import\|url(http'` → 0. Mutation: delete the `register` section of
   `concept-b.html` → 5, red.
2. **Every concept in both modes, under AA and inside the system** (decision 44). Each page renders dark by default and
   light under its toggle; the detector finds no `low-contrast` and no `design-system-*` finding on the page nor on its
   light copy. Proof: `"$IMP" detect --json <file> | grep -c '"antipattern": "\(low-contrast\|design-system-\)'` → 0 on
   the six files (§ 6). Mutation: in the light copy of `concept-b.html` set `--ai-accent` back to `oklch(0.65 0.2 305)`
   → `low-contrast` findings such as «3.5:1 (need 4.5:1) — text #ac67ef on #ffffff», red.
3. **The screenshots and the overflow walk.** For each concept: the six scenes dark at 390×844 and 1440×900, the `path`
   scene dark at 1024×768, the `interview` scene light at 390×844 — 14 shots, 42 in all — and at 390
   `main.scrollWidth === main.clientWidth` with no element of `main` past the viewport (the guard of AGENTS.md § Tailwind
   Breakpoints and Responsive Layout). Proof: `node .tmp-ai01-shots.mjs <scratch>/shots a b c` prints «42 shots, 0
   overflow». Mutation: give one row of the `path` scene `width: 480px` → a non-zero overflow count naming that row, red.
4. **The twelve theme blocks are measured.** The accent as text on each block's `--card` — `oklch(0.56 0.2 305)` on the
   six light blocks, `oklch(0.65 0.2 305)` on the six dark ones — falls under 4.5:1 in exactly the five blocks of § 4's
   table, and they are named in The AI-Accent Rule and in doc/guide/temi.md § Per-page blind spots. Proof: the detector
   on `<scratch>/themes.html` (§ 6) reports exactly five `low-contrast` findings (3.6, 3.7, 4.2, 4.3, 4.3:1);
   `grep -c "AI accent reads under 4.5:1" doc/guide/temi.md` → 1. Mutation: give the probe's light blocks the dark value
   → the default light block is flagged too (3.5:1), more than five findings, red.
5. **Each concept passed an Impeccable critique**, run on the Windows machine and committed. Proof:
   `ls .impeccable/critique/ | grep -c '__doc-ai-reference-concept-[a-d]-html'` → 3, 4 after a redo (the slug is what
   `"$IMP" critique-storage slug doc/ai/reference/concept-a.html` prints: `doc-ai-reference-concept-a-html`); the
   decision 74 row carries one line per critique (its strength · the rule it bends). Mutation: delete one snapshot → 2,
   red.
6. **The owner chose, and the choice is decision 74** (decision 37): one question call, an answer per surface, the redo
   at most once (§ 7 steps 3–6). Proof: `grep -c '^| 74 |' doc/ai/README.md` → 1, the row naming the Consulente's
   concept and the Assistente's, the canvas link, the critiques and whether the redo was used. Mutation: no row → 0,
   red.
7. **A non-B choice rewrites what was written for B** (decision 37, § 7 step 7). If the Consulente's concept is not B,
   the AI-03, AI-04 and README parts of step 7 are rewritten in this commit and README § 6 marks AI-03 and AI-04 «to be
   reread»; if the Assistente's concept is not a conversation column with cards, AI-05 § 4 Client and AI-06 § 4 Client
   are rewritten and marked too. Proof: B for both → `grep -c "to be reread" doc/ai/README.md` → 0 and
   `git diff --stat` names no `doc/ai/AI-0[3-6]`; A or C for the Consulente → `grep -c "PathRail"
   doc/ai/AI-03-redesign-percorso-corsa-report.md doc/ai/AI-04-colloquio.md` → 0 for each file and the two § 6 rows
   read «to be reread». Mutation: choose C and leave AI-03 as it is → `PathRail` still counted, red.
8. **DESIGN.md § 5 has the section «AI Surfaces»**, after Small-Screen Composition and before Modal: the three named
   rules, the Assistente paragraph and the motion table, written from the chosen concept (§ 4 holds them filled for B).
   Proof: `grep -c '^### AI Surfaces\|^\*\*The AI-Accent Rule\*\*\|^\*\*The Question-Card Rule\*\*\|^\*\*The Path-Scene Rule\*\*' DESIGN.md`
   → 4, and `grep -n '^### AI Surfaces\|^### Modal' DESIGN.md` prints the first line before the second. Mutation:
   rename «The Path-Scene Rule» → 3, red.
9. **The sentences that forbade the accent are rewritten**: the frontmatter comment, :280, :312, :331, :351, :355, :357
   and :1419 @ ce26af4d carry § 4's text. Proof: `grep -n 'page.tsx:220\|not a licence\|not endorsed\|does not get one'
   DESIGN.md` prints nothing and `grep -c '(The AI-Accent Rule)' DESIGN.md` → 8 (the section itself never writes the
   name in parentheses). Mutation: leave :351 as it is → the first grep prints it and the count is 7, red.
10. **The frontmatter parses and gains one colour.** Proof: `node <scratch>/fm.cjs DESIGN.md` (§ 6) prints
    `ok name,description,colors,typography,rounded,spacing,components | ai-accent oklch(0.65 0.2 305) | ai-accent-light oklch(0.56 0.2 305)`.
    Mutation: a top-level `motion:` block → the key list gains `motion`, red; the new key indented by one space less →
    `ERR bad indentation of a mapping entry`, red.
11. **The sidecar mirrors DESIGN.md and holds the light colour, the glow and the motion.** Proof: `node
    <scratch>/mirror.cjs` (§ 6) prints `mirror ok`; `git diff --numstat .impeccable/design.json` prints 4 deletions
    (the four rewritten strings; everything else is added, as a simulation on a copy @ ce26af4d shows). Mutation: one
    word changed in the sidecar's body of The AI-Accent Rule → `rule The AI-Accent Rule`, red; the file rewritten with
    an indent of 2 → thousands of deletions, red.
12. **The motion is specified in numbers, from values the codebase has**: every row of the table has a value and a
    reduced-motion value, built from ease-out-quart `[0.25, 1, 0.5, 1]`, `ease-spring` (the 400/35 spring sampled over
    300 ms), `staggerContainer` × `cardItem`, `useCountUp` at 620 ms and `ease-standard`; each row is an `ai-*` entry of
    `extensions.motion` with the same value. Proof: `mirror.cjs` finds every `ai-*` value as a cell of the table
    (`| <value> |`) and the section's table has 7 rows. Mutation: 620 → 600 in the table only → `motion ai-count-up`,
    red.
13. **The guides point at the section.** doc/guide/consulente.md and doc/guide/assistente.md each have § «The visual
    direction» right before § «Composizione mobile»; doc/guide/temi.md has the theme entry; nothing outside `doc/ai/`
    links `doc/ai/reference/`. Proof: `grep -n '^## The visual direction\|^## Composizione mobile'
    doc/guide/consulente.md doc/guide/assistente.md` prints, per guide, the first line right before the second;
    `grep -c 'doc/ai/reference' DESIGN.md doc/guide/*.md` → 0 for every file. Mutation: the section appended at the end
    of the guide → the order is reversed, red.
14. **No app code changed.** Proof: `git status --short` lists only `DESIGN.md`, `.impeccable/design.json`,
    `.impeccable/critique/*`, `doc/ai/*`, `doc/guide/consulente.md`, `doc/guide/assistente.md`, `doc/guide/temi.md`,
    `CLAUDE.md` and `Draft Release Temp.md`. Mutation: any file under `app/`, `components/` or `lib/` touched → listed,
    red.

## 3. Decisions

- **Decisions 3, 14, 15, 26 (owner)** as in the header.
- **Decision 36 (owner)**: what a model wrote takes a 1px `--ai-accent` border at rest, its eyebrow in the accent, and
  the glow `color-mix(in oklch, var(--ai-accent) 40%, transparent)` on hover and focus-visible only; every control that
  asks a model takes the accent on hover and focus-visible only — never at rest, never as a fill. One `--ai-accent` per
  mode, a light VALUE in `:root` and no `--ai-accent-light` CSS property; `--ai-glow` declared once in `:root`. The
  frontmatter key `ai-accent-light` names the `:root` value for the tooling (the `chart-N-light` pattern); it is not a
  CSS property.
- **Decision 37 (owner)**: no question before the mocks; the answer is A, B, C, a hybrid per surface, or «none, redo»
  — ONE concept redrawn from the owner's text, at most once. The handling is § 7 steps 3–6; the rewrite duty after a
  non-B choice is § 7 step 7 and criterion 7.
- **Decision 38 (owner)**: the question card has no button; the host owns the primary.
- **Decision 44 (owner)**: every mock in both modes; screenshots dark plus one light shot at 390 per concept; contrast
  measured in both.
- **Decisions 49, 50, 51 (owner)**: the accent on every report tile but «Applica» and «Chiedi una modifica»; the
  typical minutes `{ context: 0, strategy: 2, instruments: 2, review: 1 }` printed «di solito ~N min», nothing for 0;
  the run rail's fill is stage status, one fill per stage as it becomes active, never a percentage nor a remaining
  time.
- **Decisions 53–58, 60, 62, 64 (owner)**: the copy and the states the mocks draw — «1 tornata» / «N tornate»; «Altro…»
  always present on the Consulente; «Altro…» and «Preferisco non dire» exclusive in multiple mode; the waiting skeleton
  of two cards; «Colloquio · tornata N di 3» the scene's only `TILE_EYEBROW` and «Il Consulente chiede · i di n» a
  `TILE_SUB_EYEBROW` in the accent; the thread «Registrazioni · 1 nov 2026»; the 4000-character composer with its
  counter from 3800; the register summary before the first message; the answer message, one line per answer.
- **Decision 74 (owner, recorded by this session)**: the concept of each surface.
- **Adopted — the three directions are fixed** and the owner sees them only drawn (decision 37):
  - **A «Il taccuino»** — Consulente: the path as ONE scrolling document the user fills; an answered screen collapses
    into one line above (its answer as a chip; opening it reopens the screen in place, the mechanism of The Closed-Row
    Rule); the unanswered question is the only block still awaiting input; the interview appends its question cards to the same document;
    the run is a margin note that fills in stage by stage; the report is the document's last chapter. Assistente: the
    thread as the same document, an answered card collapsing to its one-line answer. Motion: a collapse is
    `grid-template-rows` 1fr → 0fr on `ease-spring` 300 ms, instant under reduced motion; a new block enters as a
    question card does. It is NOT a conversation column with cards (criterion 7).
  - **B «La scena»** — Consulente: one stage, one screen at a time, the rail, the run as the rail filling, the report's
    cascade (§ 4, the DESIGN.md section filled for it). Assistente: the conversation stays still, a change of mode
    slides the companion column, the cards enter with the question card's motion.
  - **C «Il colloquio»** — Consulente: a conversation on the Assistente's `desktop:grid-cols-[2fr_1fr]` grid; the eight
    screens are the Consulente's messages with the choice rows inside (The Conversation-Is-Content Rule), the answers
    become the user's rows, the interview is more turns, the run is the Consulente writing — one line «Il Consulente
    sta lavorando · {fase}», the stage list in the companion column —, the report is the last message expanded into
    tiles. Assistente: the page as it is, with the accent and a writing line «L'Assistente scrive…» while it streams
    (static under reduced motion).
  - **B is the recommendation for both surfaces**: it keeps the Consulente a path, the product's own word; it gives the
    interview a visible place on the rail; AI-03 and AI-04 are written for it; its motion is the kind DESIGN.md § 1
    already names — «physics-native … ease-out-quart state transitions», a moment that «reveal[s] a relationship rather
    than decorate[s]»: the slide says forward or back. On the Assistente it moves only the companion, never the
    conversation.
- **Adopted — the light value is `oklch(0.56 0.2 305)`** (sRGB #914ad0): on the light hover surface `--accent` (0.97)
  it reads 4.70:1, on the white card 5.13:1; 0.57 reads 4.52:1, too thin a margin. The dark value stays
  `oklch(0.65 0.2 305)` (5.07:1 on the dark card).
- **Adopted — the canvas and its repo copy**: a Design artboard is a `.dc.html` file under the canvas's `project/` that
  runs on the type's own runtime (`support.js`), so `Artifact read` returns no self-contained page: the repo copy is a
  hand transcription of each concept, and the canvas link is the record (the decision 74 row). The account has no
  Design System artifact (`list` by type «Design System» returns none @ 2026-11-01): the look is DESIGN.md's default
  theme.
- **Adopted — the transcriptions are plain HTML** with the tokens as CSS custom properties in one inline `<style>` (no
  Tailwind: the v4 `@theme` tokens do not run on the Play CDN) and no external resource; the widths are 390×844,
  1440×900 (`desktop:` is 1440px) and 1024×768 (the tablet in landscape, below `desktop:`).
- **Adopted — motion lives in `.impeccable/design.json` `extensions.motion` and in the DESIGN.md § 5 table**, never in
  the frontmatter: the Stitch frontmatter holds only `colors`, `typography`, `rounded`, `spacing` and `components`, and
  the detector has no motion rule (its design-system checks are colour, font, font size and radius). AI-03's
  `sceneVariants` test on `lib/utils/motionVariants.ts` enforces the motion in code.
- **Adopted — the session runs on the Windows machine**: Impeccable writes and closes snapshots only there (WORKFLOW.md:
  «Impeccable runs on the Windows machine since 2026-10-17») and critiques are committed (WORKFLOW.md: «Impeccable
  critiques are committed»).

## 4. Solution

### The session's steps

1. `node -v` prints v24 (decision 33). Read WORKFLOW.md; AGENTS.md § Motion, § Accessibility, § Tailwind Breakpoints
   and Responsive Layout; DESIGN.md whole; doc/guide/consulente.md, doc/guide/assistente.md, doc/guide/temi.md; the four
   Consulente components, `GoalProposalCard.tsx`, `AssistantConversazioneTile.tsx`, `AssistantComposer.tsx`,
   `AssistantStreamingResponse.tsx`, `components/ui/segmented-pill.tsx`, `lib/utils/motionVariants.ts`,
   `app/globals.css:60-160`; doc/ai/README.md § 3 and § 7; AI-05 § 4 Client and AI-06 § 4 Client (the register mode the
   mocks draw).
2. Write `doc/ai/reference/sample.json` (below).
3. The canvas: `Artifact` `quickstart` with intent `design` and `design_systems: false` names the core «Design» type.
   Create ONE canvas from it — `type_url`, `title` «Consulente e Assistente — direzioni visive», `auto_open:
   "after_first_write"` — and fill it by the type's own instructions, which the create result carries: three rows A,
   B, C, a `title1` note over each, six PAGE artboards per row (`expand: "fill"`, `w` 1440, one per scene, the first
   one `Main.dc.html`), DESIGN.md's default dark tokens in each artboard's `<helmet><style>`, the copy and the figures
   of `sample.json`. The canvas is never screenshot nor read back to check (the type's rule): the evidence comes from
   the transcriptions.
4. Transcribe each concept by hand into `doc/ai/reference/concept-{a,b,c}.html` (below).
5. The evidence (§ 6): the screenshots and the overflow walk; the detector on each page and on its light copy; the
   theme probe; the `design-system-color` control.
6. `/impeccable critique doc/ai/reference/concept-<x>.html` for each concept, handed the screenshots and the overflow
   result as its evidence (WORKFLOW.md § Obligation 4). What the critique finds against the rules — the hue
   outside The AI-Accent Rule's places, a target under 44px below `desktop:`, a scene without its reduced-motion
   caption — is fixed, and the evidence retaken, before the question.
7. The question and decision 74 (§ 7 steps 3–6).
8. DESIGN.md from the chosen concept: the section, the rewritten sentences and the frontmatter below. For B the text is
   as written here; for another concept The Path-Scene Rule, the Assistente paragraph and the motion table come from
   that concept's page-header draft and captions, and The AI-Accent Rule and The Question-Card Rule stay as written.
9. The sidecar, through the additive script (below).
10. The rewrite of decision 37 (§ 7 step 7).
11. The docs of § 9.

### The concepts' content

**`doc/ai/reference/sample.json`** — invented, round, generic names (WORKFLOW.md: «Nothing of the owner's real data in
a tracked file»): `profile` 40 anni, orizzonte 20 anni, `lossTolerance` «media», borsa «Borsa Italiana» with «un broker
online», `distributionPolicy` «accumulazione»; `portfolio` 48.000 € di ETF, 12.000 € di liquidità, uno stipendio netto
di 2.000 € al mese; `goals` «Casa al mare» 60.000 € entro il 2034 (alta), «Fondo emergenze» 12.000 € (alta), «Auto
nuova» 20.000 € entro il 2029 (media); `interview` round 1 — the note «Ho letto le tue risposte e il portafoglio: due
cose cambiano la strategia.», a single question «La casa al mare: la compri in contanti o con un mutuo?» («In
contanti», «Con un mutuo», «Altro…», «Preferisco non dire») and a multiple one «Quali entrate puoi contare nei prossimi
cinque anni?» («Un bonus annuale», «Un affitto», «Una seconda attività», «Altro…», «Preferisco non dire», the last two
exclusive); `stages` the four `STAGE_COPY` stages with `typicalMinutes` 0, 2, 2, 1 (decision 50), the strategy active
at 1:12; `proposal` Azioni 60%, Obbligazioni 25%, Liquidità 10%, Oro 5%, the instruments as descriptions with «ISIN di
esempio» and no real ISIN nor ticker («ETF azionario globale ad accumulazione», «ETF obbligazionario euro», «ETC oro
fisico», «Conto deposito»); `assistant.register` the accounts «Conto corrente» 4.000 € (default for expenses) and
«Conto deposito» 15.000 € (default for income), 24 categories, Centri di costo on, the user's message «ieri 48 € al
supermercato e 30 € di benzina», one proposal (expense 48 €, «Spesa › Supermercato», 31/10/2026, «Conto corrente»)
and one question «Da quale conto hai pagato la benzina?» («Conto corrente», «Carta di credito», «Altro…», «Preferisco
non dire»); `assistant.analysis` October 2026 — entrate 2.000 €, uscite 1.500 €, tasso di risparmio 25%, patrimonio
60.000 € — and a goal proposal «Fondo emergenze: 12.000 €».

**The six scenes**, the same content in every concept, each drawn as the concept draws it:

1. `path` — «Passo 2 di 8 · Le perdite», «Quanto reggi a vedere il portafoglio in rosso?», the rows Bassa · Media · Alta
   with their hints (`LOSS_TOLERANCE_OPTIONS`, `lib/utils/allocationAdviceNarrative.ts:61-65` @ ce26af4d), «Media»
   chosen; «Indietro» and «Avanti».
2. `interview` — «Colloquio · tornata 1 di 3», the round's note, the two question cards (the first answered, the second
   open), the footer «Continua» (primary) and «Salta il colloquio»; a second frame of the scene draws the wait: the
   previous note above, a skeleton of two cards with `aria-busy`, «Salta il colloquio» active (decision 56).
3. `run` — «Leggo il portafoglio» done; «Propongo la strategia» active with «di solito ~2 min» and «1:12»; «Cerco gli
   strumenti» and «Rivedo il tutto» pending with «di solito ~2 min» and «di solito ~1 min». The caption draws the
   failed state («Riprova», the stage in `--destructive`).
4. `report` — complete: «Allocazione proposta» (the four classes), «Strumenti», «Obiettivi» (three goals), «Ruoli degli
   asset», «Il colloquio» («1 tornata»), «Il report», «Chiedi una modifica» («Rivedi il report»), «Applica» («Applica
   alle impostazioni»). The caption says how «La strategia» (no review) and «Le fasi» (a running document after a
   reload) look.
5. `register` — Assistente › Registra: the header action «Registra» (`PencilLine`, active), the strip «Registra ·
   l'Assistente conosce categorie, conti e le ultime righe» with «Torna all'analisi», the thread «Registrazioni · 1 nov
   2026», the companion's register summary (the two accounts with balance and default, «24 categorie», the features on),
   the user's message, one «L'Assistente propone» card («Conferma», «Modifica», «Ignora»), one «L'Assistente chiede»
   card and the 44px «Rispondi» under it; the composer, and a second state of it at «3.812 / 4.000».
6. `analysis` — Assistente › Mese: the verdict, the axis «Periodo di analisi» (Mese · Anno · YTD · Storico · Libera),
   the «Conversazione» tile with one model message under its «Assistente» sub-eyebrow and one «Proposta di obiettivo»
   card with 44px «Conferma» and «Ignora», the «Domande suggerite» rows, the companion («Patrimonio oggi», «Cashflow»,
   «Cosa sa di te»), the composer.

### The transcriptions

`doc/ai/reference/concept-<x>.html`, one per concept, at most 61 440 bytes each:

- `<!doctype html>`, `<html lang="it" data-theme="dark">`, the `<title>` «Concetto <X> · <nome>»; a `<header>` with the
  concept's name, «dati d'esempio» (The Sample-Data Rule), the mode toggle (a real `<button>` switching `data-theme`
  between `dark` and `light`), and the concept's DRAFT of The Path-Scene Rule (the stage, the progress, the transition,
  the eyebrow, reduced motion, the run, the report) and of the Assistente paragraph — the text DESIGN.md takes when the
  concept is chosen.
- `<main>` holding the six `<section data-scene="path|interview|run|report|register|analysis">` in that order; each has
  a `<figcaption>` with the scene's motion in numbers, its reduced-motion behaviour and the extra states named above,
  and a «Riproduci» `<button>` that replays the scene's entrance with CSS transitions at the motion table's values;
  under `@media (prefers-reduced-motion: reduce)` the replay does what the table's last column says.
- One `<style>`: `:root { light tokens }`, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  dark tokens } }`, `:root[data-theme="dark"] { dark tokens }`; the tokens copied from `app/globals.css` `:root` (:74)
  and `.dark` (:134) @ ce26af4d, `--ai-accent` `oklch(0.56 0.2 305)` light and `oklch(0.65 0.2 305)` dark, `--ai-glow`
  as The AI-Accent Rule; `body` with an explicit background.
- Only the frontmatter's values: the font families as `typography` names them («Geist Sans», «Geist Mono»; no font file
  loads), the font sizes of `typography.scale`, the radii of `rounded`, the colours of the tokens; every target 44px
  below `desktop:`.
- No `<script src>`, no `<link>`, no URL; one inline `<script>` for the toggle and the replays; icons as inline SVG.

### The DESIGN.md section (filled for B)

Placed after The Binding-Clause Rule (:571 @ ce26af4d) and before «### Modal» (:573). Each rule is ONE paragraph on one
line, like The Binding-Clause Rule, so the sidecar mirrors it verbatim.

```markdown
### AI Surfaces (Consulente, Assistente — 2026-11)

What a model wrote reads as such, and nothing else borrows its signal. The section governs the Consulente (`/dashboard/allocation/consulente`: the path, the interview, the run, the report) and the whole Assistente page (`/dashboard/assistant`: the verdict, the companion column, the thread list, the composer, the cards in a message).

**The AI-Accent Rule** (AI Surfaces, 2026-11-01). `--ai-accent` marks what a model wrote and the controls that ask a model to write; nothing else takes it. One custom property per mode — `oklch(0.56 0.2 305)` in `:root`, `oklch(0.65 0.2 305)` in `.dark` — and `--ai-glow: color-mix(in oklch, var(--ai-accent) 40%, transparent)` declared once in `:root`. **What a model wrote** carries a 1px `--ai-accent` border at rest and the glow `0 0 14px var(--ai-glow)` on hover and focus-visible only: a question card, a proposal card, every tile of the Consulente's report except «Applica» and «Chiedi una modifica», the run's active stage; its eyebrow is printed in `--ai-accent` — «Il Consulente chiede · i di n», «L'Assistente chiede», «L'Assistente propone», «Proposta di obiettivo», «Modifica di un obiettivo», the report tiles' eyebrows, the «Assistente» sub-eyebrow over a model's message (never «Tu»). **A control that asks a model** takes the accent on hover and focus-visible only, never at rest and never as a fill — «Analizza con AI», «Avvia il colloquio», «Continua», «Avvia la ricerca», «Riprova», «Rivedi il report», «Registra», «Rispondi», «Invia messaggio», a row of «Domande suggerite» (its Sparkles icon): the border turns `--ai-accent` (a 1px ring on a filled control) and the glow appears, over `transition-[border-color,color,box-shadow] duration-200`; an outline or ghost control turns its label too, a filled control keeps `--primary-foreground` (the accent on `--primary` reads 3.50:1 light, 2.81:1 dark); the focus ring stays `ring-ring`. **Accent text sits on `--card` or on a `bg-muted/40` sub-tile over `--card`** (5.13 and 4.96:1 light, 5.07 and 4.77:1 dark), never on a full `bg-muted` (4.28:1 dark). **Never accented**: a fill of any kind (button, tile, chip, row); «Conferma», «Modifica», «Ignora», «Applica», «Applica alle impostazioni», «Salta il colloquio», «Torna all'analisi»; a verdict, the companion column, the thread list, the user's own content; model prose longer than an eyebrow; a chart series (Violet Risk, `--chart-4`, keeps its slot); the navigation. Rendimenti's «Analizza con AI» is the rule's oldest control. Measured on the twelve theme blocks (2026-11-01, text on `--card`): 4.5:1 or more in seven — default 5.13 light and 5.07 dark, Cyberpunk 5.13 and 4.53, Solar Dusk light 4.68, Elegant Luxury light 4.81, Midnight Bloom light 5.13 —, under it in Retro Arcade light 4.19 and dark 3.68, Solar Dusk dark 4.34, Elegant Luxury dark 4.31 and Midnight Bloom dark 3.58, a known gap of one value per mode (doc/guide/temi.md § Per-page blind spots); as a border every block clears 3:1.

**The Question-Card Rule** (AI Surfaces, 2026-11-01). A question with options is ONE card, and the card never holds the button that sends it. Top to bottom: the sub-eyebrow (`TILE_SUB_EYEBROW_CLASS` in `--ai-accent`: «Il Consulente chiede · i di n», «L'Assistente chiede»); the question at 16px below `desktop:` and 20px from it, weight 500; the options as the shared choice rows (`ChoiceRows`) — 44px rows below `desktop:`, a radio for one answer and a checkbox for several, the label and a one-line hint; «Altro…» opens an `Input` in place (`h-11 desktop:h-9`, no autofocus) and on the Consulente it is always there; «Preferisco non dire» is the last row; with several answers «Altro…» and «Preferisco non dire» are exclusive rows (choosing one clears the others). The surface depends on the host: on the Consulente a `rounded-xl` block with the 1px accent border and `p-4 desktop:p-5`, transparent on the scene card, the round's cards stacked `gap-4`; on the Assistente a `rounded-xl bg-muted/40` sub-tile (the Muted Sub-tile's Variant A) with the same border, inside the message. Never `bg-card` (a card inside a card), never a dropdown for 2–4 options, never a modal. The host owns the primary: on the Consulente one per round in the scene's footer — «Continua» while another round can be asked, then «Avvia la ricerca» — with the secondary «Salta il colloquio»; on the Assistente ONE 44px «Rispondi» under the message's last question card, enabled when every card has an answer and nothing streams, sending one message with one line per answer. While a round is being asked: a skeleton of two cards with `aria-busy`, «Salta il colloquio» still active, the previous round's note above it.

**The Path-Scene Rule** (AI Surfaces, 2026-11-01). The Consulente is a path on ONE stage: the 720px scene card shows one screen at a time, and the screen that leaves slides out while the next slides in along the reading direction — forward from the right; «Indietro» and every jump back from the summary from the left, whatever the distance —; the stage clips its horizontal overflow (`overflow-x-clip`). The first render (a reload, a restored draft) does not animate, and after a change the focus moves to the new screen's headline. **The rail** says where the path is and is not a control: from `desktop:` a vertical rail in a 160px column left of the card and outside it (`desktop:grid-cols-[160px_1fr]`), eight ticks with 11px labels; below `desktop:` — the phone, the tablet upright and in landscape — a strip of eight ticks above the card, the labels `sr-only`; the current tick carries `aria-current="step"`, and no tick is a button. On the goal sub-screens the «obiettivi» tick stays current and the eyebrow adds «obiettivo n di m»; the interview's three ticks (a sibling list «Il colloquio», `aria-hidden` until the interview starts) light in the accent one round at a time. The scene's eyebrow is its only `TILE_EYEBROW`: «Passo n di 8 · {tema}», «Colloquio · tornata N di 3». **The run** turns the rail into the four stages and fills it with stage STATUS, one segment as each stage becomes active — done in `--muted-foreground`, active in `--ai-accent`, pending in `--border`, failed or stale in `--destructive`, never the accent —; each stage row keeps its label and what it reads and adds «di solito ~N min» (nothing for the portfolio read) and the active stage's elapsed time, outside the live region; never a percentage, never a remaining time. **The report** enters with the Panoramica's cascade, once per session under a once-flag of its own; its tiles follow The AI-Accent Rule. Under reduced motion a slide becomes a fade and nothing else moves (the table below).

**The Assistente page** (AI Surfaces, 2026-11-01). The conversation is the page (The Conversation-Is-Content Rule): the «Conversazione» tile and, from `desktop:`, the companion column at `desktop:grid-cols-[2fr_1fr]`. A change of mode — a period of «Periodo di analisi», Registra — keeps the conversation still and slides the companion column's content as a screen of the Consulente slides; question and proposal cards enter with the question card's motion. In Registra the axis gives way to the strip «Registra · l'Assistente conosce categorie, conti e le ultime righe» with «Torna all'analisi»; before the first message the companion shows the register summary computed in the browser (the cash accounts with their balance and the two defaults, the number of categories, the features on); the thread is «Registrazioni · 1 nov 2026», one per Italian day. The composer holds 4000 characters and shows its counter from 3800. The verdict, the companion, the thread list («Conversazioni») and the composer take no accent beyond the hover of «Invia messaggio», of «Registra» and of the suggestion rows.

| Motion | Value | Reduced motion |
|---|---|---|
| Screen change, entering | x ±24px → 0 · 0.25 s · ease-out-quart | opacity 0 → 1 · 0.15 s |
| Screen change, leaving | x 0 → ∓24px · 0.18 s · ease-out-quart | opacity 1 → 0 · 0.1 s |
| Question card, entering | y 8px → 0 · 0.2 s · ease-out-quart | appears |
| Run stage fill | scaleX 0 → 1 · ease-spring · 300 ms | instant |
| Report, entering | staggerContainer 80 ms × cardItem 0.4 s · once per session | appears |
| Figures (the proposed percentages) | useCountUp · once · 620 ms | the final value |
| AI control, hover and focus | border, colour, glow · 200 ms · ease-standard | unchanged |

ease-out-quart is `[0.25, 1, 0.5, 1]` (`lib/utils/motionVariants.ts`); ease-spring is `--ease-spring` (`app/globals.css`), the 400/35 spring sampled over 300 ms, run through `motion-safe:` classes as a closed row is; staggerContainer and cardItem are the Panoramica's; useCountUp at 620 ms is Rendimenti's.
```

### The sentences DESIGN.md rewrites (@ ce26af4d)

- **:68-71**, the frontmatter comment, and a new key after :72 — the block of «The frontmatter» below.
- **:280** → `- Achromatic structural palette; data colors carry all chromatic meaning in the default theme, and one declared
  accent marks what a model wrote (The AI-Accent Rule)`.
- **:312**, its first sentence «The default palette has no hue anywhere.» → «The default palette has no hue anywhere but
  on what a model wrote (The AI-Accent Rule).»
- **:331**, the sentence «These are the system's only sanctioned source of hue in the default theme.» → «These, and the
  AI accent on what a model wrote (The AI-Accent Rule), are the system's only sanctioned sources of hue in the default
  theme.»
- **:351** → `- **AI accent** (`--ai-accent`: `oklch(0.65 0.2 305)` in `.dark`, `oklch(0.56 0.2 305)` in `:root`): the one
  accent of the chrome. It marks what a model wrote — the border, the eyebrow and the hover glow of a question card, a
  proposal card, a report tile and the run's active stage — and, on hover and focus only, every control that asks a
  model, Rendimenti's «Analizza con AI» (`app/dashboard/performance/page.tsx:299`) the oldest of them (The AI-Accent
  Rule); no other surface takes it.`
- **:355** → `**The Zero-Chroma Rule.** The default surface palette has no hue. Adding a brand color to buttons, cards, or
  navigation in the default theme is forbidden. Color is earned by data, not decoration — and by what a model wrote,
  which carries the AI accent on its border and eyebrow and nowhere else (The AI-Accent Rule).`
- **:357** → `**The Data Owns Color Rule.** Chart palettes, performance indicators, and the five named themes are the only
  sanctioned sources of chromatic energy, with one declared exception: the AI accent on what a model wrote and on the
  hover of a control that asks a model (The AI-Accent Rule). Interface chrome in the default theme is otherwise
  achromatic.`
- **:1419** → `- **Don't** add brand color to the default theme's surface chrome (backgrounds, cards, buttons). Zero-chroma
  is the rule: color belongs to data, not decoration. The AI accent is not a brand colour: it marks what a model wrote
  (The AI-Accent Rule).`

Each replacement is one line in the file, as the original is.

### The frontmatter (the normative layer)

```yaml
  # The AI accent (§ 5 → AI Surfaces): it marks what a model wrote (a 1px border at rest, the
  # eyebrow, a 14px 40% glow on hover and focus-visible only) and, on hover and focus-visible
  # only, a control that asks a model (The AI-Accent Rule). Never a fill. ONE `--ai-accent` per
  # mode: `.dark` holds ai-accent, `:root` holds ai-accent-light (4.5:1 as text on --card and
  # on a bg-muted/40 sub-tile, both modes). The glow is `--ai-glow`, in the sidecar's shadows.
  ai-accent: "oklch(0.65 0.2 305)"
  ai-accent-light: "oklch(0.56 0.2 305)"
```

Nothing else enters the frontmatter: no `motion:` key, no glow key (a shadow recipe is not a colour).

### The sidecar `.impeccable/design.json`

A scratchpad Node script reads the file, applies the changes below, and writes `JSON.stringify(data, null, 1) + '\n'`
(the round-trip is byte-identical @ ce26af4d) with the line ending it found in the working copy (`\r\n` on a CRLF
clone):

- `extensions.colorMeta` gains, after `ai-accent`: `"ai-accent-light": { "role": "accent", "displayName": "AI Accent
  (light)", "canonical": "oklch(0.56 0.2 305)", "tonalRamp": ["oklch(0.15 0.06 305)", "oklch(0.25 0.1 305)", "oklch(0.35
  0.14 305)", "oklch(0.45 0.18 305)", "oklch(0.55 0.2 305)", "oklch(0.56 0.2 305)", "oklch(0.8 0.114 305)", "oklch(0.95
  0.03 305)"] }` (the sixth step is the canonical, as `chart-4-light`'s).
- `extensions.shadows` gains `{ "name": "ai-glow", "value": "0 0 14px color-mix(in oklch, var(--ai-accent) 40%,
  transparent)", "purpose": "The AI-Accent Rule: on hover and focus-visible only, around what a model wrote and a
  control that asks a model; --ai-glow holds the colour, declared once in :root." }`.
- `extensions.motion` gains seven entries whose `value` is the table's cell, verbatim: `ai-scene-enter`
  («x ±24px → 0 · 0.25 s · ease-out-quart»), `ai-scene-exit` («x 0 → ∓24px · 0.18 s · ease-out-quart»),
  `ai-question-enter` («y 8px → 0 · 0.2 s · ease-out-quart»), `ai-run-fill` («scaleX 0 → 1 · ease-spring · 300 ms»),
  `ai-report-enter` («staggerContainer 80 ms × cardItem 0.4 s · once per session»), `ai-count-up` («useCountUp · once ·
  620 ms»), `ai-hover` («border, colour, glow · 200 ms · ease-standard»); each `purpose` says where it runs and what
  reduced motion does, in the table's words, and names nothing that does not exist yet.
- `narrative.rules` gains, right after «The Binding-Clause Rule», three entries `{ "name", "body", "section":
  "components" }` for The AI-Accent Rule, The Question-Card Rule and The Path-Scene Rule, `body` being the paragraph
  after `** ` verbatim; the bodies of «The Zero-Chroma Rule» and «The Data Owns Color Rule» become the new text after
  `.** `; the `keyCharacteristics` item «Achromatic structural palette; …» and the `donts` item «**Don't** add brand
  color …» become the new :280 and :1419 text after `- `.

### The contrast, measured (OKLCH → linear sRGB with CSS Color 4 gamut mapping, 8-bit, WCAG 2.x; @ ce26af4d)

The default theme, accent text on every surface the rules allow and on the two they forbid:

| Surface | Light, 0.56 | Dark, 0.65 |
|---|---|---|
| `--card` (a tile, the scene card) | 5.13 | 5.07 |
| `bg-muted/40` over `--card` (the sub-tile) | 4.96 | 4.77 |
| outline hover (`--accent` light, `input/50` dark) | 4.70 | 4.82 |
| ghost hover (`--accent` light, `accent/50` over the card dark) | 4.70 | 4.72 |
| `--background` (the rail outside the card) | 5.13 | 5.60 |
| full `--muted` — forbidden | 4.70 | 4.28 |
| `--primary` (a filled control's label) — forbidden | 3.50 | 2.81 |

The twelve theme blocks, accent text on `--card` (the named blocks inherit the mode's value: none sets `--ai-accent`):

| Block (`app/globals.css`) | `--card` | Ratio | Text 4.5:1 |
|---|---|---|---|
| default light `:root` (:78) | `oklch(1 0 0)` | 5.13 | passes |
| default dark `.dark` (:137) | `oklch(0.205 0 0)` | 5.07 | passes |
| Retro Arcade light (:303) | `oklch(0.9306 0.0260 92.4020)` | 4.19 | fails |
| Retro Arcade dark (:347) | `oklch(0.3092 0.0518 219.6516)` | 3.68 | fails |
| Cyberpunk light (:395) | `oklch(1.0000 0 0)` | 5.13 | passes |
| Cyberpunk dark (:437) | `oklch(0.2542 0.0611 281.1423)` | 4.53 | passes |
| Solar Dusk light (:486) | `oklch(0.9686 0.0091 78.2818)` | 4.68 | passes |
| Solar Dusk dark (:529) | `oklch(0.2685 0.025 48.0000)` | 4.34 | fails |
| Elegant Luxury light (:572) | `oklch(0.9779 0.0042 56.3756)` | 4.81 | passes |
| Elegant Luxury dark (:613) | `oklch(0.2685 0.022 18.0000)` | 4.31 | fails |
| Midnight Bloom light (:656) | `oklch(1.0000 0 0)` | 5.13 | passes |
| Midnight Bloom dark (:699) | `oklch(0.3210 0.030 268.0000)` | 3.58 | fails |

Every block clears 3:1 as a border on `--card`. Two themes put their `--primary` near the accent's hue: Midnight Bloom
at 283 (22° away) and Cyberpunk at 341 (36°). The detector's `low-contrast` agrees with this table to its one decimal.

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **DESIGN → The Zero-Chroma Rule, The Data Owns Color Rule** — here it means that the accent stays on the border, the
  eyebrow, the hover glow and the AI control's hover; a mock with the hue on a fill, a chip, a verdict or the
  navigation fails its critique and is redrawn before the question.
- **DESIGN → The Sample-Data Rule, WORKFLOW.md «Nothing of the owner's real data in a tracked file»** — here it means
  that `sample.json` is invented, round and generic, each page's header says «dati d'esempio», and the private canvas
  holds the same figures.
- **DESIGN.md is never regenerated** (DESIGN.md § How this file is read by tooling) — here it means that the section is
  typed by hand, never produced by `impeccable-documenter`, and the sidecar changes only through the additive script.
- **DESIGN → The Modal-Is-A-Tile Rule** — here it means that a question card is never a modal: the interview happens in
  the scene, the chat's questions in the message.
- **AGENTS.md § Motion** — here it means that the Framer motion lives in `lib/utils/motionVariants.ts` under one
  `MotionConfig reducedMotion="user"`, and a CSS-timed motion runs through `motion-safe:` classes (`ROW_MOTION_CLASS`,
  `components/ui/tile.tsx:129` @ ce26af4d): every row of the table has its reduced value, and each scene's caption
  states it — A's collapse and C's writing line included.
- **AGENTS.md § Accessibility (44px)** — here it means that the rows and the buttons of every card are 44px below
  `desktop:` in all three concepts; `GoalProposalCard`'s 36px buttons are drawn at 44px.
- **AGENTS.md § Tailwind Breakpoints and Responsive Layout** — here it means that `desktop:` is 1440px: the 1440×900
  shots show the desktop layout, the 1024×768 shot the layout below it (the strip of ticks, not the rail), and the
  overflow guard is `main.scrollWidth === main.clientWidth` plus the walk of `main *`.
- **The Stitch frontmatter** accepts `colors`, `typography`, `rounded`, `spacing`, `components` only — here it means
  that `ai-accent-light` is the one new key; the motion and the glow live in the sidecar.
- **The detector's colour tolerance**: it accepts any `oklch(L 0.2 305)` with L from 0.54 to 0.57 against the
  `ai-accent` ramp's 0.55 step, even before the frontmatter edit, so a `design-system-color` probe cannot prove the new
  key is read. The parse is proven by js-yaml (`fm.cjs`), the light value by `low-contrast` (0.65 flagged at 3.5:1 on
  white, 0.56 not); the `design-system-color` control is `oklch(0.52 0.2 305)`, flagged.
- **The detector reads a broken frontmatter leniently** (a wrong indent still loads the colours): it cannot prove «no
  parse error»; `fm.cjs` does.
- **The detector's advisory findings** — `overused-font` (Geist), `tiny-text` (the 10px eyebrow), `cramped-padding` —
  come from the app's own type system and are not criteria; only `low-contrast` and `design-system-*` are.
- **The values lead the code until AI-03**: DESIGN.md declares `oklch(0.56 0.2 305)` for `:root` and `--ai-glow`, while
  `app/globals.css:96` still reads 0.65 and has no `--ai-glow`; this session changes no app file (criterion 14).
- **Names before birth**: DESIGN.md and the sidecar name only what exists @ ce26af4d (`ChoiceRows`,
  `TILE_SUB_EYEBROW_CLASS`, `staggerContainer`, `cardItem`, `useCountUp`, `--ease-spring`); `ChoiceList`,
  `QuestionCard`, `PathRail`, `sceneVariants`, `Tile`'s `generated` and `STAGE_TYPICAL_MINUTES` enter DESIGN.md with
  the specs that create them (AI-03 § 9, AI-04 § 9).
- **The narrative mirror is not whole today**: seven rules of `narrative.rules` do not match DESIGN.md byte for byte @
  ce26af4d (The Out-Of-DOM Token Rule, The DOM-side hex inventory, The Declared-Window Rule, The Received-vs-Announced
  Rule, The Off-Axis Tile Rule, The Whole-Cost Corollary, The Risk-vs-Fact Rule). This session neither fixes nor
  widens that drift: `mirror.cjs` checks the five rules it writes and the three lists.
- **The Windows clone is CRLF for part of the tree**: the sidecar script keeps the file's line ending, DESIGN.md is
  edited with the Edit tool, `git diff --stat` is the truth over git's «LF will be replaced» warnings.
- **The Design type's own rule** «never verify» binds the canvas: the screenshots, the detector and the critiques read
  the transcriptions only.
- **One accent value per mode** (decision 36): the five theme blocks under 4.5:1 are recorded, not fixed.
- **The silent cases the mocks must draw**: the goal sub-screens («obiettivo n di m», the «obiettivi» tick current);
  a jump back from the summary (it slides backward whatever the distance); the first render after a reload or a
  restored draft (no animation); a failed or stale run (`RUN_STALE_AFTER_MS`, 20 minutes,
  `lib/utils/allocationAdviceDocument.ts:26` @ ce26af4d: the segment in `--destructive`); a running document opened
  after a reload («Le fasi» in the report's caption); the tablet (1024×768).
- **Geist Sans is never applied in the app** (CLAUDE.md Known Issues): the mocks name the family as the frontmatter does
  and load no font, so they render in the system UI font as the app does.
- **Cases that do not change**: the demo (the Consulente does not exist there — doc/guide/consulente.md § Per-page blind
  spots, «The demo has no Consulente» — and the Assistente is blocked, so no AI surface renders in demo and no mock
  draws one); the navigation chrome (DESIGN.md:1368 @ ce26af4d: the assistant is a route, not a violet banner); the
  email and the PDF (out of the DOM, `lib/constants/printTokens.ts` carries no accent); the chart palette (Violet Risk
  keeps its slot); Rendimenti's button (already the hover the rule describes).

## 6. Tests per level

- **Static — the only level this spec has.** `IMP` is the Impeccable plugin's launcher:
  `"$HOME/.claude/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/scripts/impeccable"` (4.8.0 @ 2026-11-01;
  `impeccable.cmd` sits beside it for a Windows shell). It runs from the repo root, reads `DESIGN.md` and `.impeccable/`
  there, and has no dry run.
  - The pages: `"$IMP" detect --json doc/ai/reference/concept-<x>.html | grep -c '"antipattern": "\(low-contrast\|design-system-\)'`
    → 0, and the same on `<scratch>/concept-<x>.light.html` (the page with `data-theme="light"` on `<html>`): the
    detector resolves custom properties and `[data-theme]` selectors (probed @ 2026-11-01).
  - The theme probe `<scratch>/themes.html`: twelve `<section>`, each with a class that sets `--card` to its block's
    value (§ 4) and `--ai-accent` to its mode's value, its background `var(--card)`, a 10px `<p>` in
    `var(--ai-accent)` naming the block → exactly five `low-contrast` findings.
  - The `design-system-color` control, before relying on zero findings: a scratch page with one element in
    `oklch(0.52 0.2 305)` → one `design-system-color` finding.
  - The frontmatter, `<scratch>/fm.cjs`, run from the repo root (js-yaml resolves from the repo's `node_modules`):

    ```js
    const fs = require('fs');
    const yaml = require(require.resolve('js-yaml', { paths: [process.cwd()] }));
    const fm = fs.readFileSync(process.argv[2], 'utf8').split(/^---\r?$/m)[1];
    try {
      const doc = yaml.load(fm);
      console.log('ok', Object.keys(doc).join(','), '| ai-accent', doc.colors['ai-accent'], '| ai-accent-light', doc.colors['ai-accent-light']);
    } catch (e) { console.log('ERR', e.message.split('\n')[0]); process.exitCode = 1; }
    ```

  - The mirror, `<scratch>/mirror.cjs`, run from the repo root (@ ce26af4d it prints the three missing rules):

    ```js
    const fs = require('fs');
    const md = fs.readFileSync('DESIGN.md', 'utf8').replace(/\r\n/g, '\n');
    const d = JSON.parse(fs.readFileSync('.impeccable/design.json', 'utf8'));
    const bad = [];
    for (const n of ['The AI-Accent Rule', 'The Question-Card Rule', 'The Path-Scene Rule', 'The Zero-Chroma Rule', 'The Data Owns Color Rule']) {
      const r = d.narrative.rules.find((x) => x.name === n);
      if (!r || !(md.includes(`**${n}** ${r.body}`) || md.includes(`**${n}.** ${r.body}`))) bad.push(`rule ${n}`);
    }
    for (const k of ['keyCharacteristics', 'dos', 'donts']) for (const s of d.narrative[k]) if (!md.includes(`- ${s}`)) bad.push(`${k} ${s.slice(0, 40)}`);
    for (const m of d.extensions.motion.filter((x) => x.name.startsWith('ai-'))) if (!md.includes(`| ${m.value} |`)) bad.push(`motion ${m.name}`);
    console.log(bad.length ? bad.join('\n') : 'mirror ok');
    ```

  - The screenshots and the overflow walk, `.tmp-ai01-shots.mjs` in the repo root (so `playwright` resolves, WORKFLOW.md
    § Obligation 4; deleted in phase G), `node .tmp-ai01-shots.mjs <scratch>/shots a b c` (add `d` after a redo):

    ```js
    import { chromium } from 'playwright';
    import { pathToFileURL } from 'node:url';
    import { resolve } from 'node:path';
    const [out, ...concepts] = process.argv.slice(2);
    const scenes = ['path', 'interview', 'run', 'report', 'register', 'analysis'];
    const browser = await chromium.launch();
    let shots = 0; const overflow = [];
    for (const c of concepts) {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(resolve(`doc/ai/reference/concept-${c}.html`)).href);
      const shoot = async (width, height, theme, scene) => {
        await page.setViewportSize({ width, height });
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
        await page.locator(`[data-scene="${scene}"]`).screenshot({ path: `${out}/${c}-${scene}-${width}-${theme}.png` });
        shots += 1;
      };
      for (const s of scenes) { await shoot(390, 844, 'dark', s); await shoot(1440, 900, 'dark', s); }
      await shoot(1024, 768, 'dark', 'path');
      await shoot(390, 844, 'light', 'interview');
      await page.setViewportSize({ width: 390, height: 844 });
      const found = await page.evaluate(() => {
        const main = document.querySelector('main');
        const list = main.scrollWidth === main.clientWidth ? [] : ['main'];
        for (const el of main.querySelectorAll('*')) if (el.getBoundingClientRect().right > innerWidth + 0.5) list.push(`${el.tagName}.${el.className}`);
        return list;
      });
      overflow.push(...found.map((x) => `${c}: ${x}`));
      await page.close();
    }
    await browser.close();
    console.log(`${shots} shots, ${overflow.length} overflow`);
    if (overflow.length) console.log(overflow.join('\n'));
    ```

  - The greps of criteria 1, 5–9, 13 and 14.
- **No Vitest, no Playwright spec**: no code changes. The motion reaches a test with AI-03 (`sceneVariants`) and AI-04.

## 7. Guided verification (WORKFLOW.md § 2)

- **A — Invarianza**
  1. `node -v` → v24 (decision 33); the branch starts clean from `develop`.
  2. At the end, criterion 14's `git status --short`, and `mirror.cjs` passing on `keyCharacteristics`, `dos` and
     `donts` (what this spec does not rewrite keeps its mirror).
- **B — Cambio di contesto: the owner chooses** (decision 37)
  3. Nothing is asked before the mocks: the three concepts are drawn, transcribed, measured and critiqued first (§ 4
     steps 2–6).
  4. ONE `AskUserQuestion` call with two questions; the canvas link and each concept's one-line critique (its strength ·
     the rule it bends) go in the questions' text, since the terminal shows no image. «Consulente»: «B · La scena
     (consigliata)», «A · Il taccuino», «C · Il colloquio», «Nessuna delle tre, rifai». «Assistente»: «B · La scena
     (consigliata)», «C · Il colloquio», «A · Il taccuino». A hybrid is two different answers.
  5. «Nessuna delle tre, rifai»: one more question collects the owner's brief as free text; the session draws ONE
     concept D from it (a canvas row, `concept-d.html`, its evidence and its critique: § 4 steps 3–6) and asks step 4
     once more, with A, B, C and D in both questions and no redo option.
  6. The answer is decision 74 in README.md § 3, dated: the concept of each surface, the canvas link, one line per
     critique, the redo used or unused.
- **C — Comportamento nuovo**
  7. **The rewrite duty of decision 37**, in this session's commit, from the chosen concept's page-header draft and
     captions:
     - the Consulente's concept is not B → AI-03 criteria 2, 3 and 9, § 3 (the rail, `PathRail`, the slide direction),
       § 4 «The scene», § 5's rail traps, § 6's `sceneVariants` test and the E2E rail and reduced-motion assertions,
       § 7 E, § 9's rail lines, its Draft Release line and § 11; AI-04 criterion 10 and its tests; README.md A20, A22
       and the § 7 rows of `PathRail` and of `motionVariants`; README § 6 marks AI-03 and AI-04 «to be reread», and the
       next session opens with a targeted adversarial reading of the rewritten parts;
     - the Assistente's concept is not a conversation column with cards (A; a D drawn as a document) → AI-05 § 4
       Client and AI-06 § 4 Client, marked «to be reread» as well;
     - B for both surfaces → nothing to rewrite.
  8. The static proofs of § 6, criteria 1–14.
- **D, E** — none: no route, no data, no rights change.
- **F — Giro guidato** (the owner)
  9. The session publishes the chosen Consulente concept's page as ONE private Artifact — and the Assistente's concept
     page too when the choice is a hybrid — (each page already follows the Artifact page contract: the tokens on
     `:root`, the dark-mode guards, an explicit `body` background). The owner opens it on the phone at 390, toggles
     the mode, presses «Riproduci» on `path`, `interview` and `register`, and confirms that the progress and the
     transition read as intended. A «no» while the redo is unused IS the redo (step 5), and DESIGN.md follows D; a «no»
     after the redo stops the session with nothing committed and the owner's words in the report.
- **G — Ripristino**
  10. `.tmp-ai01-shots.mjs` deleted from the repo root; the light copies, the probes and the screenshots stay in the
      scratchpad; the canvas and the Artifact stay private; `SESSION_NOTES.md` is not committed.
  11. CLAUDE.md «Latest» records the outcome (§ 9; WORKFLOW.md § Closing a verification).

## 8. Putting it into service

One branch `docs/ai-direzione-visiva` off `develop` (with AI-00 merged), one commit `docs(design): AI Surfaces — the
accent, the question card, the path scene (concept <X>)` after the owner's OK on the diff summary (WORKFLOW.md § 1), a
PR to `develop`. Nothing deploys.

## 9. Documentation

- **DESIGN.md**: the section «AI Surfaces» between The Binding-Clause Rule (:571) and «### Modal» (:573) @ ce26af4d; the
  frontmatter comment :68-71 rewritten and `ai-accent-light` after :72; the sentences at :280, :312, :331, :351, :355,
  :357 and :1419 replaced by § 4's text. The file stays hand-maintained.
- **`.impeccable/design.json`**: § 4 «The sidecar».
- **`doc/guide/consulente.md`**: a new § «The visual direction» right before § «Composizione mobile». No sentence of the
  guide becomes false: it describes today's code, which does not change.

  ```markdown
  ## The visual direction

  The Consulente follows DESIGN.md § 5 → «AI Surfaces», concept <X> «<nome>» (chosen on <date>): **The Path-Scene
  Rule** (one stage, the rail that says where the path is and fills with the run's stages, the slide forward and
  back, the report's cascade), **The Question-Card Rule** (the interview's cards; the scene's footer owns «Continua»
  and «Avvia la ricerca») and **The AI-Accent Rule** (the accent on what the model wrote and, on hover and focus only,
  on «Avvia il colloquio», «Continua», «Avvia la ricerca», «Riprova», «Rivedi il report»). The code follows it from the
  redesign of the path, the run and the report on; until then § The path, § The run and § The report and «Applica»
  describe what renders.
  ```

- **`doc/guide/assistente.md`**: a new § «The visual direction» right before § «Composizione mobile»:

  ```markdown
  ## The visual direction

  The whole page follows DESIGN.md § 5 → «AI Surfaces», concept <Y> «<nome>» (chosen on <date>): **The AI-Accent
  Rule** (the accent on the «Assistente» sub-eyebrow of a model's message, on proposal and question cards, and on the
  hover of «Invia messaggio», «Registra», «Rispondi» and the suggestion rows; never on the verdict, the companion
  column, the thread list or the user's messages), **The Question-Card Rule** (the cards inside a message, ONE
  «Rispondi» under the last) and the paragraph «The Assistente page». The code follows it from the Registra mode on.
  ```

- **`doc/guide/temi.md` § Per-page blind spots** (:168 @ ce26af4d), a new entry:

  ```markdown
  - **The AI accent reads under 4.5:1 as TEXT on the card in five theme blocks** (measured <date>, DESIGN.md → The
    AI-Accent Rule): `oklch(0.56 0.2 305)` on the light blocks and `oklch(0.65 0.2 305)` on the dark ones, on `--card`
    — Retro Arcade light 4.19:1 and dark 3.68:1, Solar Dusk dark 4.34:1, Elegant Luxury dark 4.31:1, Midnight Bloom
    dark 3.58:1; every block clears 3:1 as a border. The accent is one value per mode by the owner's choice of
    2026-11-01, so an AI eyebrow reads under AA there; Midnight Bloom's `--primary` (hue 283) also sits 22° from the
    accent, Cyberpunk's (341) 36°. The fix is a per-theme `--ai-accent`, a decision on those themes' look.
  ```

- **doc/ai/README.md**: decision 74 in § 3; the § 6 row of AI-01 «implemented on …, PR #… in develop since …»; the
  marks and the rewrites of § 7 step 7.
- **CLAUDE.md** «Latest», one clause that replaces the previous entry: «**AI-01**: the visual direction chosen — the
  Consulente <X «nome»>, the Assistente <Y «nome»> — and written in DESIGN.md § 5 → AI Surfaces (the accent per mode,
  the question card, the path scene); no app code.»
- **`Draft Release Temp.md`**, under «## 📚 Documentation», prepended: «- **Direzione visiva AI (DESIGN.md, guide del
  Consulente e dell'Assistente)** — The Consulente has a visual direction: <one sentence of the chosen concept; for B:
  one stage that slides screen by screen, a rail that says where the path is and fills with the run's stages, and a
  report that arrives tile by tile with what the model wrote edged in violet>. The Assistente has one too: <one
  sentence; for B: the conversation stays still while the side column changes with the mode, and every card the model
  writes carries the same violet edge>.»
- **AGENTS.md, PRODUCT.md, README.md**: nothing. No stub names the accent (`grep -c "ai-accent" AGENTS.md` → 0); the
  Consulente stub (:450-456) and the Assistant stub (:473-480) change with AI-03 and AI-05; nothing the user sees
  changes.

## 10. Declared out of scope

- **The implementation**: AI-03 (the tokens in `app/globals.css` — `:root`'s `--ai-accent` set to `oklch(0.56 0.2
  305)`, `--ai-glow` once —, the scene, the rail, the report's accent through `Tile`'s `generated`, `ChoiceList`, and
  `ChoiceRows` renamed `ChoiceList` in The Question-Card Rule); AI-04 (`QuestionCard`, the interview); AI-05 (the
  Assistente page under «AI Surfaces», decision 26); AI-06 (the `otherSelect` sentence of The Question-Card Rule, the
  cards in the chat).
- **A per-theme accent**: not done (decision 36, one value per mode); the five blocks under AA stay a known gap in
  doc/guide/temi.md.
- **Rendimenti's «Analizza con AI»**: not restyled (decision 36 names it among the hover-accented controls); it keeps
  its literal `color-mix`, the value `--ai-glow` holds.
- **No heir** (decision 22): what this spec does not do is done by the specs named above, or not done.

## 11. The prompt that implements it

In Italian (decision 34).

```
Leggi WORKFLOW.md, AGENTS.md (§ Motion, § Accessibility, § Tailwind Breakpoints and Responsive Layout), DESIGN.md per
intero, doc/guide/consulente.md, doc/guide/assistente.md, doc/guide/temi.md e doc/ai/AI-01-direzione-visiva-consulente.md
(con doc/ai/README.md § 3, § 7 e § 8). Lavora sulla macchina Windows (le critiche di Impeccable si scrivono solo lì) e
controlla per primo `node -v` (v24). Esegui AI-01 così com'è scritta: sample.json inventato; UNA tela Design con le tre
direzioni della § 3, sei scene ciascuna (percorso, colloquio, corsa, report, Assistente › Registra, Assistente › Mese);
le tre trascrizioni a mano in doc/ai/reference/, in entrambi i modi; gli screenshot e il controllo di overflow con lo
script della § 6; il detector `scripts/impeccable detect --json` del plugin Impeccable sulle tre pagine, sulle copie
chiare e sulla sonda dei dodici temi; una critica /impeccable per concetto. Nessuna domanda prima dei mock. Poi UNA
chiamata dello strumento di domande con due domande (Consulente, Assistente), B per prima e consigliata, il link della
tela e le critiche in una riga nel testo: «rifai» ridisegna UN concetto dal mio testo, una volta sola. La scelta è la
decisione 74 del README. Scrivi a mano (mai rigenerare DESIGN.md) la sezione «AI Surfaces» dal concetto scelto, le
frasi della § 4, il frontmatter (solo ai-accent-light), il sidecar con lo script additivo, le guide. Se per il
Consulente scelgo A o C, riscrivi nello stesso commit le parti di AI-03, AI-04 e del README elencate nella § 7 passo 7
e segnale «to be reread»; se per l'Assistente scelgo A, riscrivi AI-05 § 4 Client e AI-06 § 4 Client. Fermati e
chiedimi se: quickstart non nomina il tipo Design; il detector dà a una pagina un verdetto di contrasto diverso dalla
tabella della § 4, o un low-contrast o un design-system-* che non sai togliere senza uscire dalle regole; una pagina
supera 61 440 byte; lo script trova un elemento fuori da main a 390; i valori di --card in app/globals.css non sono
quelli della tabella. Nessun file di codice dell'app cambia. Collaudo: § 7 della spec. Un branch, un commit, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Fable 5.1**, effort **high** (design judgement, three critiques, one canvas). Estimated size: 1 session, ~4 h:
six scenes × three concepts on the canvas and in three pages of 400–600 lines, ~130 lines of DESIGN.md, ~70 lines of
sidecar, ~25 lines of guides.
