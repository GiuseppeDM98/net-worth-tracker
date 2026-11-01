# AI-01 — The Consulente's visual direction: three concepts, one choice

> Series `doc/ai/` (README.md § 5): **depends on nothing** (a documentation session; the repo of AI-00 is not needed),
> and AI-03, AI-04, AI-05, AI-06 depend on it. Written on 2026-11-01 from `develop` @ b9411a4d. Executes decision 3
> (concepts in a spec of their own), decision 14 (scope: path, interview, run, report) and decision 15 (`--ai-accent`
> on the AI surfaces). **No app code changes in this session**: its deliverables are three mocks, one choice, and
> the DESIGN.md section that AI-03..06 implement against.

## 1. The problem today (evidence on the code)

- **The path has no scene**: `components/allocation/consulente/ConsulenteWizard.tsx` (471 lines @ b9411a4d) renders one
  card `TILE_SURFACE_CLASS mx-auto max-w-[720px] p-5 desktop:p-6`, an eyebrow «Passo n di 8 · tema», a 24/30px
  headline, the fields, two buttons `h-11 desktop:h-9`. Changing screen swaps the content with no transition
  (`grep -c framer-motion components/allocation/consulente/*.tsx` → 0). The eight screens look like one Settings form
  repeated eight times.
- **The run is a list**: `ConsulenteRun.tsx` (70 lines) shows the four stages with a spinner on the active one and the
  elapsed time; nothing says what the model is reading or how long a stage usually takes (the guide knows: 2.6 · 2.7 ·
  1.7 minutes on the owner's mirror of 2026-10-20).
- **The report is seven standard tiles** (`ConsulenteReport.tsx`, 397 lines): Allocazione proposta, Strumenti,
  Obiettivi, Ruoli, Il report, Chiedi una modifica, Applica — correct, under every named rule, and indistinguishable
  from any other page: nothing marks «a model wrote this» (DESIGN → Status-Is-The-Reading says the status must be
  readable, and here the status is «generated»).
- **The accent exists and is forbidden**: DESIGN.md:351 declares `--ai-accent oklch(0.65 0.2 305)` «declared, not
  endorsed … the next surface that wants a hue for “AI” does not get one»; its only use is the hover of «Analizza con
  AI» on Rendimenti (`app/dashboard/performance/page.tsx:299` @ b9411a4d — the DESIGN.md line number 220 is stale).
  Decision 15 overturns that sentence for the two AI surfaces.
- **Two copies of the choice rows** (`ChoiceRows` in `ConsulenteWizard.tsx:118` and `components/assets/compravendita/fields.tsx:22`),
  a 36px button inside the only AI card the app has (`GoalProposalCard.tsx`, `h-9` under the 44px floor): the
  primitive the interview and the chat need does not exist yet. AI-03 creates it; this spec draws it.

## 2. Goal and acceptance criteria

The owner chooses one of three visual directions for the Consulente's four scenes, on invented figures, and the
choice is written where AI-03..06 can implement it without asking again.

1. **Three concepts exist as rendered mocks**, each covering the FOUR scenes (a path screen with a choice list, an
   interview round with one question card, the run, the report), at 390px AND 1280px, on the Sample-Data Rule's
   invented figures (no owner data: a 2.000 € salary, 48.000 € of ETFs, a goal «Casa al mare» are examples). Proof:
   the three Artifact links in the session notes; the files under `doc/ai/reference/` (the dossier's folder, as
   `doc/mobile/reference/` was).
2. **Each concept passed an Impeccable critique** (`/impeccable critique` on the mock) and the three critiques are
   summarised in the owner's question (strengths, the rule each one bends). Proof: the critiques quoted in the
   session notes.
3. **The owner chose one** through the question tool (one question, three options + «nessuna delle tre, rifai»),
   and the choice is decision 21 of README.md § 3 with the date. Proof: the index row.
4. **DESIGN.md § 5 has a new section «AI Surfaces»** with three named rules — **The AI-Accent Rule** (where the hue
   goes and where it never goes), **The Question-Card Rule** (the anatomy of a question with options: eyebrow,
   question, rows, free text, the confirm), **The Path-Scene Rule** (the stage, the transition, the eyebrow, the
   progress) — and the frontmatter extended with the tokens the section introduces. Proof: `grep -n "AI Surfaces\|The AI-Accent Rule\|The Question-Card Rule\|The Path-Scene Rule" DESIGN.md`
   prints four lines; the impeccable detector still reads the frontmatter (`npx impeccable detect --dry-run` or the
   equivalent command in `.impeccable/`, no parse error).
5. **DESIGN.md:351's sentence is rewritten**: the accent is endorsed on the two AI surfaces under The AI-Accent Rule
   and the stale line number is fixed. Proof: the diff.
6. **No app code changed** (`git diff --stat` touches only `DESIGN.md`, `.impeccable/design.json` if the sidecar
   needs an extension, `doc/ai/`, `doc/guide/consulente.md`). Proof: the diff stat.
7. **The chosen concept's motion is specified in numbers** (durations, easings, what moves under reduced motion),
   and every value is one the codebase already has (`--ease-spring`, the ease-out-quart `[0.25,1,0.5,1]`, the spring
   400/35) or is added to the frontmatter as a token with a name. Proof: the «AI Surfaces» section's motion table.

## 3. Decisions

- **Decision 3, 14, 15 (owner)** as in the header.
- **Adopted, reversible — the three directions to draw** (the owner may replace any before the mocks are made):
  - **A «Il taccuino»** — the path as a single scrolling document the user fills: every answered screen collapses to
    one line above (the chip of the answer), the open question is the only tile; the interview appends its
    question cards to the same document; the run is a margin note that fills in; the report is the document's last
    chapter. Quiet, zero chroma, the accent only on the eyebrow «Il Consulente» of what the model wrote.
  - **B «La scena»** — one stage, one screen at a time, the previous one sliding out (x −24px, 0.25 s ease-out-quart)
    and the next sliding in; a thin progress rail on the left (desktop) or top (phone) with eight ticks, the interview
    rounds as three more ticks drawn in the accent; the run as the rail itself filling, stage by stage, with the
    typical duration written; the report arrives with the Panoramica cascade. The accent as a 1px border + 14px glow
    on the question cards and the active stage.
  - **C «Il colloquio»** — the whole Consulente as a conversation on the Assistente's `[2fr_1fr]` grid: the eight
    screens are the Consulente's messages with the choice list inside (Conversation-Is-Content), the user's answers
    become user bubbles-as-rows, the interview is literally more turns, the run is the Consulente «typing» with the
    stage line, the report is the last message expanded to tiles. Shares the most with AI-05/06.
- **Adopted, reversible**: the mocks are HTML pages written by hand (Tailwind tokens from `app/globals.css`, the
  twelve themes not needed: one dark, one light), published as private Artifacts for the owner, and the three HTML
  files saved under `doc/ai/reference/concept-{a,b,c}.html` (≤ 60 KB each, inline CSS, no CDN but Tailwind's).
- **Adopted, reversible**: the native `/design` (the Artifact Design canvas) draws the concepts; `/impeccable` critiques
  them (memory: a user-pinned direction beats Impeccable's concept-seed; DESIGN.md is never regenerated by
  `impeccable-documenter` — the section is hand-written).
- **Adopted, reversible**: the accent's light-mode value is checked for contrast on the card border (`oklch(0.65 0.2 305)`
  on `--card` light must reach 3:1 as a non-text border); if it does not, the section declares a light-mode value
  (e.g. `oklch(0.55 0.2 305)`) as a second token line in the frontmatter, and AI-03 adds it to `app/globals.css`.

## 4. Solution

### The session's steps

1. Read DESIGN.md whole (the frontmatter, § 2 Named Rules, § 5 Modal/Buttons/Segmented Pill/Muted Sub-tile/Collapsible,
   § 6), `doc/guide/consulente.md`, `doc/guide/assistente.md`, the four Consulente components, `GoalProposalCard.tsx`,
   `segmented-pill.tsx`, `lib/utils/motionVariants.ts`, `app/globals.css:60-80` (the easing tokens).
2. Build the invented data set once (`doc/ai/reference/sample.json`: the answers of the eight screens, one interview
   round with two questions, the four stages with their typical durations, a proposal of four classes, three goals).
3. For each concept: `/design` → the canvas → export → the HTML file; render at 390 and 1280 (Playwright screenshot
   script in the scratchpad, memory «Browser evidence: Playwright fallback»); `/impeccable critique` on the file.
4. The question to the owner: three options with their screenshots described in words (the terminal shows no
   image: the Artifact links go in the question's text), recommended one first — **B «La scena»** is the
   recommendation: it keeps the Consulente a path (the product's word), gives the interview a visible place on the
   rail, costs the least in AI-05/06 (the question card is a component, not a conversation grid) and its motion is
   the kind DESIGN § 1 already prescribes (purposeful, under 300 ms, one thing at a time).
5. Write DESIGN.md § 5 «AI Surfaces» from the chosen concept (the template below); rewrite line 351; extend the
   frontmatter; run the detector's dry run.
6. `doc/guide/consulente.md`: a new § «La direzione visiva» of 6–10 lines pointing at the DESIGN.md section and
   listing what AI-03 changes (so a reader of the guide before AI-03 lands knows the path is about to move).

### The DESIGN.md section (template; the chosen concept fills the blanks)

```markdown
### AI Surfaces (Consulente, Assistente › Registra — 2026-11)

What the model generated is READABLE as such, and nothing else borrows the signal.

**The AI-Accent Rule.** `--ai-accent` (`oklch(0.65 0.2 305)` dark, `<light value>` light) marks a surface the model
wrote: the 1px border and the 14px `color-mix(in oklch, var(--ai-accent) 25%, transparent)` glow of a question card
and of a proposal card; the eyebrow «Il Consulente» / «L'Assistente propone»; the active stage of a run. It is never a
fill: no button, no tile background, no chart series, no text longer than an eyebrow. A user's own content (answers,
rows, messages) never carries it. Rendimenti's «Analizza con AI» hover is this rule's oldest instance.

**The Question-Card Rule.** A question with options is ONE card: eyebrow (the AI accent, «Il Consulente chiede ·
2 di 3»), the question at 16/20px medium, the options as `ChoiceList` rows (44px, radio, label, one-line reason),
an optional free-text row «Altro…» that opens an input in place (the CategoryDeleteConfirmDialog pattern), a single
primary «Rispondi» at the foot; a multi-select question uses checkboxes in the same rows. Never a dropdown for 2–4
options; never a modal. Width: the host's column (720px on the Consulente, the message column on the Assistente).

**The Path-Scene Rule.** <from the chosen concept: the stage, the rail/progress, the transition's axis, duration and
easing, what the eyebrow says, what happens under reduced motion, how the run shows the typical duration, how the
report enters>.

| Motion | Value | Reduced motion |
|---|---|---|
| Screen change | <x ±24px · 0.25 s · ease-out-quart> | opacity 0.15 s |
| Question card enter | <y 8px → 0 · 0.2 s · ease-out-quart> | none |
| Run stage fill | <width · --ease-spring · 0.4 s> | instant |
| Report enter | Panoramica cascade (`tileGridEntrance`, once) | none |
| Figures | `useCountUp` 0.6 s | final value |
```

### The frontmatter extension (normative layer)

Under the existing keys (`ai-accent` at line 72), add `ai-accent-light`, `ai-glow` (the `color-mix` recipe as a
string), and a `motion.ai` block with the four rows of the table (names and values) so the detector can flag a
hard-coded violet or a stray duration. The sidecar `.impeccable/design.json` is NOT rewritten by hand: if the
detector needs an extension, it is added through its own command and the diff checked.

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **DESIGN → Zero-Chroma Rule, Data Owns Color** — here it means that the accent stays on border, eyebrow, glow; the
  mocks are rejected in the critique step if a button or a tile fill takes the hue.
- **DESIGN → The Sample-Data Rule, WORKFLOW § 1.6** — here it means that `sample.json` is invented, round, and uses the
  product's demo names; the Artifacts are private and still carry no real figure.
- **Memory «never regenerate DESIGN.md»** — here it means that the section is typed, not produced by
  `impeccable-documenter`; the frontmatter is edited by hand and validated by the detector's dry run.
- **DESIGN → The Modal-Is-A-Tile Rule** — here it means that the question card is NOT a modal: the interview happens
  on the page, in the column.
- **AGENTS.md § Motion (`prefers-reduced-motion`)** — here it means every row of the motion table has its reduced
  value; a concept with motion that cannot degrade to a fade is not chosen.
- **The 44px floor** (AGENTS.md § a11y) — here it means the question card's rows and buttons are 44px on a phone in
  all three mocks; the 36px of `GoalProposalCard` is the thing being replaced.
- **`doc/guide/consulente.md` is in Italian today** (one of the 20 older guides) — here it means the new § is written
  in English and the rest of the guide is left as it is (WORKFLOW rule 4: a guide is rewritten in English when a
  session rewrites it anyway; adding one section is not that).

## 6. Tests per level

- **Static (the only level this spec has)**: the impeccable detector's dry run on the frontmatter; `grep` for the four
  headings (criterion 4); `git diff --stat` for criterion 6. Mutation that proves the detector reads the new keys:
  temporarily misspell `ai-accent-light` as a bare hex in a scratch copy of a component and run the detector on that
  file — it must flag it; then delete the scratch copy.
- **No Vitest, no Playwright** (no code).

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the seven criteria; the expected outcome «three mocks, one chosen, the section written, no app code».
- **B**: the owner reads the three Artifacts (the links in the question); the question tool collects the choice and
  any wording the owner wants in the rules.
- **C**: the detector's dry run, the grep, the diff stat.
- **D, E**: none (no data, no app).
- **F**: the owner opens the chosen mock at 390 on their phone (the Artifact link) and confirms the rail/transition
  reads as intended; a «no» reopens step 4 with the free-text answer as the new brief.
- **G**: scratchpad screenshots removed; the Artifacts stay private; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

One branch `docs/ai-direzione-visiva`, one commit `docs(design): AI Surfaces — the accent, the question card, the
path scene (concept <X>)`, PR to `develop`. Nothing deploys.

## 9. Documentation

- DESIGN.md: the new § 5 section, the rewritten line 351, the frontmatter keys (the file stays hand-maintained).
- `doc/guide/consulente.md`: § «The visual direction» (6–10 lines, English).
- `doc/ai/README.md`: decision 21 (the chosen concept, dated), the § 6 row «implemented on …», the `reference/`
  files listed under § 7's visual-direction row.
- `.impeccable/design.json` only if the detector's own command extends it.
- CLAUDE.md: nothing (the Design Context paragraph already points at DESIGN.md).

## 10. Declared out of scope

- The implementation of the direction: AI-03 (Consulente), AI-05/06 (Assistente).
- The Assistente's whole-page redesign beyond the proposal/question cards: heir CLAUDE.md § Not yet present («the
  Assistente's page under the AI Surfaces rules beyond its cards»).
- Rendimenti's «Analizza con AI» button restyle: untouched; it already obeys The AI-Accent Rule.
- The twelve themes' per-theme accent: the accent is one value per mode in both; a per-theme hue is heir of
  `doc/guide/temi.md` if a theme ever clashes (the section says which themes were checked: the default dark and
  light).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, DESIGN.md per intero, doc/guide/consulente.md, doc/guide/assistente.md e doc/ai/AI-01-direzione-visiva-consulente.md
(con doc/ai/README.md § 3 e § 4). Esegui AI-01 così com'è scritta: le tre direzioni della § 3 disegnate con /design
sul set di dati inventati, ogni mock critico con /impeccable, le tre critiche riassunte in UNA domanda con lo
strumento interattivo (B «La scena» per prima, raccomandata), poi la sezione «AI Surfaces» di DESIGN.md § 5 scritta
a mano dal concetto scelto (mai rigenerare DESIGN.md), la frase della riga 351 riscritta, il frontmatter esteso e il
detector in dry run. Nessun file di codice dell'app cambia. Collaudo: § 7 della spec. Un branch, un commit, solo dopo
il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Fable 5.1**, effort **high** (design judgement, three critiques). Estimated size: 1 session, ~3 h; three HTML
mocks of 300–500 lines each, ~120 lines of DESIGN.md, 10 lines of guide.
