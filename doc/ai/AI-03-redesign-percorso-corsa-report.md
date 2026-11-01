# AI-03 — The redesign of the path, the run and the report; `ChoiceList`

> Series `doc/ai/` (README.md § 5): **depends on AI-01** (the chosen concept and DESIGN.md § 5 «AI Surfaces»);
> **AI-04, AI-05, AI-06 depend on it** (`ChoiceList`, the path's new shape). Written on 2026-11-01 from `develop`
> @ b9411a4d. Executes decision 14 (scope: path, run, report — the interview is AI-04 but its PLACE on the path is
> drawn here) and the adopted choices A19, A20, A21. **This spec is written for concept B «La scena»** (AI-01's
> recommendation); if the owner chooses A or C in AI-01, the adversarial reading of AI-03 rewrites § 4 «The scene»
> and § 6's E2E assertions from the chosen concept before implementation, and nothing else in this spec changes.

## 1. The problem today (evidence on the code)

- `components/allocation/consulente/ConsulenteWizard.tsx` (471 lines @ b9411a4d): one `<section>` card
  (`TILE_SURFACE_CLASS mx-auto w-full max-w-[720px] p-5 desktop:p-6`, :202), the eyebrow «Passo n di 8 · tema» (:205),
  the headline, the fields per `step` (:218-325), the footer «Indietro / Avanti» (:327-351); «Avvia la ricerca» on the
  summary (:343). No motion; the step change re-renders in place. The run replaces the card entirely
  (`if (run.state.kind !== 'idle') return <ConsulenteRun …/>`, :185-188).
- `ChoiceRows` (:118) and `components/assets/compravendita/fields.tsx:22` are the same component typed twice (Radix
  `RadioGroup`, `divide-y rounded-xl border`, 44px rows); the Compravendita's is the exported one with the better
  doc comment.
- `ConsulenteRun.tsx` (70 lines): the four `ALLOCATION_ADVICE_STAGES` as an `<ol>` with a check / spinner / dot;
  the headline from `describeRunHeadline`; nothing about the typical duration (the guide knows them) or what the
  model is reading; the only live region is the headline (`role="status" aria-live="polite"`, :35).
- `ConsulenteReport.tsx` (397 lines): tiles «Le fasi», «Allocazione proposta», «Strumenti», «Obiettivi», «Ruoli degli
  asset», «Il report», «Chiedi una modifica», «La strategia», «Applica»; standard `Tile` with eyebrow/aside/reading;
  nothing says a model wrote the prose beyond the aside `model · date`.
- Motion helpers that exist: `lib/utils/motionVariants.ts` (`fadeVariants`, `tabPanelSwitch`, `staggerContainer`,
  `cardItem`, ease-out-quart `[0.25, 1, 0.5, 1]`), `--ease-spring` in `app/globals.css:66-71`, the Panoramica cascade
  once per session (`tileGridEntrance`, `app/dashboard/page.tsx:168`), `lib/utils/useCountUp.ts:105` (`useCountUp`,
  the Net Worth Counter's), `AnimatePresence mode="wait"` precedent in `CashflowSankeyChart.tsx:78`.
- E2E `e2e/allocation.consulente.spec.ts` asserts `heading /Passo N di 8/`, `button Avanti/Indietro`,
  `radio` by name, `#consulente-*` ids, `radiogroup` count 3 on step 6, and never clicks «Avvia la ricerca».
- `__tests__/reactCompilerCoverage.test.ts` holds the Wizard compiled (a ternary inside `||` was skipped on day one).

## 2. Goal and acceptance criteria

The Consulente's three views obey DESIGN.md § 5 «AI Surfaces» as written by AI-01; the choice rows become one
primitive; nothing the path ASKS changes.

1. **`components/ui/choice-list.tsx` exists and is the only choice-rows component**: `ChoiceList` used by the
   Wizard (steps tolleranza, politica, ruoli), by the Compravendita's `fields.tsx` (re-exporting `ChoiceRows` =
   `ChoiceList` for one release is NOT done: the call sites change), and ready for AI-04/06. Proof:
   `grep -rn "function ChoiceRows" components` → 0; both E2E specs (`allocation.consulente`, `compravendita*`) green.
2. **The Path-Scene Rule is implemented**: the rail (eight ticks + the interview's place drawn as three dimmed ticks
   labelled «Colloquio», inert until AI-04), the screen transition (`AnimatePresence mode="wait"`, x ±24px, 0.25 s,
   ease-out-quart; opacity 0.15 s under reduced motion), the eyebrow unchanged in words. Proof: the E2E spec's
   `/Passo N di 8/` assertions still pass; a new assertion reads the rail (`getByRole('list', { name: 'Il percorso' })`
   with 8 `listitem` + an `aria-current="step"` on the open one); the reduced-motion project (Playwright
   `reducedMotion: 'reduce'` on one test) sees no `transform` on the card.
3. **The run shows the typical duration and what is being read**: each stage row carries `STAGE_COPY[stage].detail`
   (exists) + «di solito N min» from a new `STAGE_TYPICAL_MINUTES: Record<AllocationAdviceStage, number>` in
   `allocationAdviceNarrative.ts` (`context 0, strategy 3, instruments 3, review 2`, from the mirror runs of
   2026-10-20/23); the active stage's rail segment fills with `--ease-spring`; the elapsed time per stage; the
   headline stays the ONE live region. Proof: `allocationAdviceNarrative.test.ts` on the copy; a Vitest render test
   on `ConsulenteRun` with a fake state asserts one `[aria-live]`.
4. **The report enters with the cascade and marks what the model wrote**: `tileGridEntrance` applied once;
   the «Il report» and «La strategia» tiles carry the AI-Accent border/eyebrow per DESIGN; the proposal's percentages
   count up (`useCountUp`, 0.6 s, final value under reduced motion); nothing else in the tiles' content changes.
   Proof: Playwright on the fixture with a seeded `allocationAdvice/{uid}` document (the harness's seed can write
   it: `e2e-emulatori.md` § data-only planting) sees the report's tiles and the accent class on exactly two tiles.
5. **The accent token exists in CSS**: `--ai-accent` already; `--ai-accent-light` and `--ai-glow` added to
   `app/globals.css` per AI-01's frontmatter, in the `:root` and the dark block, not per theme. Proof: `grep -n "ai-accent" app/globals.css`
   prints the three lines; `__tests__/themes*.test.ts` (whichever reads the theme blocks) untouched.
6. **No answer changes**: `allocationAdviceDraft` reducer, `allocationAdviceAnswersSchema`, the ids `#consulente-*`,
   the button labels, the «Passo N di 8» wording, the Summary's content are the same. Proof: the suites
   `allocationAdviceDraft`, `allocationAdviceProposal` untouched and green; the E2E spec's existing lines unchanged.
7. **React Compiler coverage**: `reactCompilerCoverage` green with the Wizard, `ChoiceList`, `ConsulenteRun`,
   `ConsulenteReport` compiled (the `AnimatePresence` children keyed by `draft.step`, no logic inside `try`).
8. **Mobile first screen**: `npm run mobile:budget` green on `mobile:consulente` if an entry exists; if none, no
   entry is added (the Consulente is not a composed page) — recorded in the session notes.
9. **44px targets everywhere on a phone** (`ChoiceList` rows, rail ticks are NOT targets — they are `aria-current`
   indicators, the «Indietro» button is the way back; the footer buttons `h-11 desktop:h-9`). Proof: the mobile
   overflow guard of the E2E spec (memory: the 390px guard) and a `getBoundingClientRect` assertion on the rows.

## 3. Decisions

- **Decision 14, 15 (owner)**, **A19, A20, A21**, and AI-01's decision 21 (the concept).
- **Adopted, reversible**: the rail is navigation-free (ticks are not buttons): the path is linear by design
  (`describeStepBlock` holds «Avanti»), and the Summary's «Modifica» links (`onGoto`) remain the only jumps.
- **Adopted, reversible**: `ChoiceList` supports `multiple?: boolean` (checkbox rows, `value: T[]`) from day one,
  because AI-04's questions and AI-06's detail questions need it (the Rule of Three satisfied by the three
  consumers, not by speculation: the Wizard single, the Compravendita single, the interview both).
- **Adopted, reversible**: `ChoiceList` has an optional `other?: { label; value; placeholder }` row that reveals an
  `Input` in place when selected (the `CategoryDeleteConfirmDialog.tsx:342` pattern), for «Altro…» in questions; the
  Wizard does not use it.
- **Adopted, reversible**: the direction of the slide follows the step delta (forward = enter from +24px; back =
  from −24px), held in a `direction` ref updated by the reducer's action type, not derived from state.
- **Adopted, reversible**: the ConsulenteRun's rail is the same component as the path's (`PathRail`, local to
  `components/allocation/consulente/`), in «run» mode (segments fill instead of ticks).
- **Adopted, reversible**: `STAGE_TYPICAL_MINUTES` is copy, not a promise: the row says «di solito ~3 min».

## 4. Solution

### `components/ui/choice-list.tsx` (the shared contract)

```tsx
'use client';
export interface ChoiceListOption<T extends string> { value: T; label: string; description?: string; disabled?: boolean }
export const CHOICE_ROW_CLASS = 'flex items-start gap-3 px-4 py-3';

type Single<T extends string> = { multiple?: false; value: T | null; onChange: (value: T) => void };
type Multiple<T extends string> = { multiple: true; value: readonly T[]; onChange: (value: T[]) => void };

export type ChoiceListProps<T extends string> = (Single<T> | Multiple<T>) & {
  name: string;
  options: ReadonlyArray<ChoiceListOption<T>>;
  /** The group's accessible name (a `<legend>`-like label; the question's text when inside a QuestionCard). */
  label: string;
  /** An «Altro…» row: selecting it reveals an input in place; its text is reported through `onOtherChange`. */
  other?: { value: T; label: string; placeholder?: string; text: string; onOtherChange: (text: string) => void };
  className?: string;
};

export function ChoiceList<T extends string>(props: ChoiceListProps<T>): JSX.Element;
```

- Single: Radix `RadioGroup` + `RadioGroupItem` (as today); multiple: a `<div role="group">` of `Checkbox` rows
  (`components/ui/checkbox.tsx` exists — verify; if not, Radix checkbox is already a dependency of shadcn's).
- Rows: `divide-y divide-border rounded-xl border border-border`, `CHOICE_ROW_CLASS`, label `min-h-11` on phone,
  `text-[14px] font-medium` + `text-[13px] text-muted-foreground` description — the classes of today's two copies,
  moved once.
- `other`: when `value === other.value`, an `Input` (`FIELD_HEIGHT_CLASS`) renders under the row with
  `aria-label={other.label}` and autofocus; the Compravendita's `EXCHANGE_OTHER` pattern of the Wizard's exchange
  field stays a `Select` (it is a long list), untouched.
- Call sites: `ConsulenteWizard.tsx` ×3 (`loss`, `policy`, the three `RoleBlock`s), `fields.tsx` ×N (grep
  `ChoiceRows`), delete both local definitions.

### The scene (concept B)

- `components/allocation/consulente/PathRail.tsx` (new, local): props `{ steps: readonly string[]; current: number;
  interview?: { total: 3; reached: number | null }; mode: 'path' | 'run'; stages?: … }`. Renders
  `<ol aria-label="Il percorso">` with one `<li>` per step, `aria-current="step"` on `current`; on desktop a vertical
  rail in a left column (`desktop:grid-cols-[160px_1fr]` on the Consulente's section, the 720px card becomes the
  right column), on phone a horizontal strip of ticks above the card (height 24px, no labels, the eyebrow says the
  step). The interview's three ticks are drawn after the 8th in `text-muted-foreground/50` with the label
  «Colloquio» and no `aria-current` until AI-04 lights them.
- `ConsulenteWizard.tsx`: wrap the card's body (`<div className="mt-5 …">` + headline) in
  `<AnimatePresence mode="wait" custom={direction}><motion.div key={draft.step + ':' + draft.goalIndex} variants={sceneVariants} custom={direction} initial="enter" animate="center" exit="exit">`;
  `sceneVariants` in `lib/utils/motionVariants.ts`:

```ts
export const sceneVariants: Variants = {
  enter: (direction: 1 | -1) => ({ x: 24 * direction, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: [0.25, 1, 0.5, 1] } },
  exit: (direction: 1 | -1) => ({ x: -24 * direction, opacity: 0, transition: { duration: 0.18, ease: [0.25, 1, 0.5, 1] } }),
};
export const sceneVariantsReduced: Variants = { enter: { opacity: 0 }, center: { opacity: 1, transition: { duration: 0.15 } }, exit: { opacity: 0, transition: { duration: 0.1 } } };
```

  chosen by `useReducedMotion()` (framer's). The footer and the eyebrow stay OUTSIDE the animated node (they do not
  move; focus stays on «Avanti»).
- Focus: after a transition the headline receives focus (`tabIndex={-1}` + `ref.focus({ preventScroll: true })` in the
  `onAnimationComplete` of `center`), so a screen reader announces the new question; today nothing moves focus.
- `ConsulenteRun.tsx`: the `PathRail` in run mode above/beside the stage list; each stage row gains the typical
  minutes and, for the active one, the elapsed time (`useElapsed(startedAt)` local, 1 s tick, cleared on unmount);
  the active row's left border in `--ai-accent` (The AI-Accent Rule: the active stage of a run).
- `ConsulenteReport.tsx`: `motion.div variants={tileGridEntrance}` around the grid (import the module-level once-flag
  pattern from `app/dashboard/page.tsx:168` — move it to `lib/utils/motionVariants.ts` as `tileGridEntranceOnce()`
  if it is not exported yet); the two prose tiles get `className="border-[color:var(--ai-accent)]/40 shadow-[0_0_14px_var(--ai-glow)]"`
  (the exact classes AI-01's section prescribes) and the eyebrow «Il report · scritto da {model}»; the percentages in
  «Allocazione proposta» through `useCountUp`.
- `app/globals.css`: the two new tokens under the existing `--ai-accent` lines (dark and light blocks).

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **AGENTS.md § React Compiler** — here it means the `AnimatePresence` child is keyed and pure; the `direction` lives
  in a ref written in the dispatch wrappers (`next()`/`back()` helpers), not computed in render from previous
  state; `reactCompilerCoverage` is the gate.
- **AGENTS.md § Motion / DESIGN § 1 (purposeful, < 300 ms, reduced motion)** — here it means 0.25 s enter, 0.18 s exit,
  opacity-only under reduced motion; the rail's fill is the ONE spring.
- **DESIGN → The One-Eyebrow Rule** — here it means the rail has no visible labels on phone; the card's eyebrow is the
  only one; on desktop the rail's labels are `text-[11px]` ticks, not eyebrows (they are a list, `aria-label` names it).
- **DESIGN → The Modal-Is-A-Tile Rule / no card-within-card** — here it means the rail is outside the card, the
  `ChoiceList` is a bordered list inside the card (as today), never a tile.
- **The 44px floor** — rows and buttons; ticks are not targets.
- **AGENTS.md § a11y: ONE live region per page** — here it means the run's headline is the live region; the elapsed
  time is `aria-hidden` (it would chatter every second).
- **`useRovingFocus` for a list as one Tab stop** — here it means the Radix group already handles arrows; the
  checkbox mode uses `useRovingFocus(options.length, 'vertical')` so a multi-select list is one Tab stop too.
- **E2E: the FILENAME picks the project** — the spec stays `allocation.consulente.spec.ts` (desktop) and a new
  `allocation.consulente.mobile.spec.ts` (390) runs the rail/overflow assertions.
- **No owner data** — the seeded `allocationAdvice` document for the report test is invented (`e2e/seed` fixture).

## 6. Tests per level (with the mutation that proves each)

- **Vitest**:
  - `__tests__/choiceList.test.tsx` (new, RTL): single select calls `onChange` with the value; multiple toggles;
    `other` reveals the input and reports text; `label` is the group's accessible name. Mutation: drop `aria-label`
    → `getByRole('radiogroup', { name })` fails.
  - `allocationAdviceNarrative.test.ts`: `STAGE_TYPICAL_MINUTES` has all four stages and the copy says «di solito».
    Mutation: remove `review` → the `Record` type fails `tsc`, the test fails on the key.
  - `motionVariants.test.ts` (extend or create): `sceneVariants.enter(1).x === 24`, `enter(-1).x === -24`,
    `sceneVariantsReduced` has no `x`. Mutation: swap the sign → fails.
  - `reactCompilerCoverage`: the four components in the compiled set.
- **Playwright**:
  - the existing desktop spec unchanged + the rail assertion (criterion 2) + `aria-current` moves on «Avanti».
  - `allocation.consulente.mobile.spec.ts`: 390px, the horizontal rail, no horizontal overflow (`document.documentElement.scrollWidth <= 390`),
    rows ≥ 44px, one test with `reducedMotion: 'reduce'` asserting the card has no `transform` mid-transition
    (`page.evaluate(() => getComputedStyle(card).transform) === 'none'` right after the click).
  - `allocation.consulente.report.spec.ts` (new, desktop): the seeded ready document → the report shows, two tiles
    carry the accent class, the proposal's percentages reach the final value (`toHaveText` after 1 s). Mutation: put
    the accent on three tiles → the count assertion fails.
- **Perf**: `npm run perf:budget` (framer is already on the page: the Wizard's chunk grows by the `AnimatePresence`
  import only; a raised ceiling needs `raisedBy`).

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the nine criteria; the outcome «the path slides, the rail reads, the run says how long, the report marks
  the model's prose, the eight questions are the same».
- **B**: the diff of `ChoiceList` and of the Wizard's render tree with the owner; DESIGN.md § 5 re-read against the
  screenshots.
- **C**: `npx tsc --noEmit`, `npm run lint`, both-zone Vitest on the suites above, `npm run test:e2e -- allocation.consulente compravendita`,
  `npm run perf:budget`.
- **D**: none (no data written).
- **E**: emulators + `dev:emulator`; screenshots at 390/768/1280 of step 1, step 2 mid-transition (Playwright
  `page.clock` or a 100 ms wait), the run with a FAKED route (`page.route('/api/allocation-advice/run', …)` streaming
  `stage` events with delays), the report from the seeded document — never «Avvia la ricerca» against the real
  route.
- **F**: the owner walks the eight screens on their phone (the preview URL of the PR) and reads the report of
  their LAST real document (already in Firestore from 2026-10: no new run) — the accent, the cascade, the count-up;
  the owner's «ok» or wording.
- **G**: the fake-route scripts and screenshots in the scratchpad removed; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

Branch `feat/consulente-scena`, commit `feat(consulente): the path as a scene — rail, transitions, ChoiceList, the
run's durations, the report's accent`, PR to `develop`, the preview opened by the owner for phase F. No flag.

## 9. Documentation

- `doc/guide/consulente.md` § Il percorso: the rail, the transition, the focus move, `ChoiceList`; § La corsa: the
  typical minutes copy; § Il report: the accent and the cascade; § Files: `PathRail.tsx`, `choice-list.tsx`,
  the two new E2E specs; § Per-page blind spots: «the rail's ticks are not buttons» and «the elapsed time is
  aria-hidden» (English sentences in an Italian guide, WORKFLOW rule 4).
- `doc/guide/compravendita.md` § Files: `ChoiceRows` → `ChoiceList` (`components/ui/choice-list.tsx`).
- DESIGN.md § 5 «AI Surfaces»: the «implemented on» line under The Path-Scene Rule with the file names (no rule
  rewritten).
- AGENTS.md: `components/ui/choice-list.tsx` added to the shared-primitives line (CLAUDE.md § Key Files too: one
  name).
- `Draft Release Temp.md`: «Il percorso del Consulente scorre: una guida a lato dice dove sei, la corsa dice quanto
  manca».

## 10. Declared out of scope

- The interview's screens and its ticks lighting up: AI-04.
- `GoalProposalCard`'s 36px buttons and the Assistente's cards: AI-05.
- A redesign of the Allocazione page's «Consulente» link/tile: untouched (decision 14).
- `ExchangeField`'s `Select`: untouched (a long list is a Select, DESIGN § Inputs).
- Per-theme accents: AI-01 § 10.

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ React Compiler, § Motion, § a11y, § Commands), DESIGN.md § 1 e § 5 «AI Surfaces»,
doc/guide/consulente.md, doc/guide/compravendita.md, doc/guide/e2e-emulatori.md, doc/ai/README.md § 3-4-7 e
doc/ai/AI-03-redesign-percorso-corsa-report.md. Se in AI-01 è stato scelto un concetto diverso da B, fermati e
dimmelo: la § 4 va riscritta prima. Implementa AI-03 così com'è scritta: `ChoiceList` con il contratto della § 4
(identico: lo usano AI-04, AI-05, AI-06), le due copie di `ChoiceRows` eliminate, la scena con `PathRail`, le
varianti in motionVariants.ts, la corsa con i minuti tipici, il report con l'accento e la cascata, i token in
globals.css. Nessuna domanda del percorso cambia. Vitest in entrambe le zone, le tre spec Playwright (desktop,
mobile, report) con la corsa SEMPRE finta via page.route. Collaudo: § 7 della spec. Un branch, un commit, solo dopo
il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Fable 5.1**, effort **xhigh** (motion + a11y + compiler coverage across four components). Estimated size:
1 long session, ~5 h; ~150 lines `choice-list.tsx`, ~120 `PathRail.tsx`, ~120 of diff in the Wizard, ~60 in the
run, ~40 in the report, ~200 of tests, two E2E specs.
