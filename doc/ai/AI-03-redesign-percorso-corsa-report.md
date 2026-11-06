# AI-03 — The redesign of the path, the run and the report; `ChoiceList`

> Series `doc/ai/` (README.md § 5): **depends on AI-00** (retired on 2026-11-03, in develop since 2026-11-03, PR #497: the clean repo on Node 24, the dependency gate and the
> register of `doc/guide/dipendenze.md`) **and AI-01 (retired on 2026-11-06, in develop since 2026-11-06, PR #503): the chosen concept, DESIGN.md § 5 «AI Surfaces» with The
> AI-Accent Rule and The Path-Scene Rule, the light-mode value of `--ai-accent`); **AI-04, AI-05, AI-06 depend on it**
> (`ChoiceList`, the RTL harness, `Tile`'s `generated`, the classes of `lib/constants/aiAccent.ts`; AI-04 also
> `PathRail`'s `interview` and the scene variants). Written on 2026-11-01 from `develop` @ b9411a4d (the code is
> identical at ce26af4d). Executes decision 14 (scope: the path, the run, the report; the interview is AI-04) and the
> adopted choices A19, A20, A21. **This spec is written for concept B «La scena»**, the owner's choice for the
> Consulente (decision 74, 2026-11-06; the conditional of decision 37 is settled). § 4 rewritten on 2026-11-06 at
> AI-01's retirement (decision 78: the rail's fills and the interview ticks in the accent, the active stage row as a
> generated surface, `AI_CONTROL_ACCENT_CLASS` + `AI_CONTROL_ACCENT_LABEL_CLASS`, `cardEnterVariants`), to be reread
> there.
> Read adversarially on 2026-11-01: 46 findings applied, the decisions 21–73 in README.md § 3 (this spec: decisions
> 14, 15, 21, 22, 26, 33, 34, 35, 36, 37, 39, 49, 50, 51, 52, 55).

## 1. The problem today (evidence on the code)

- `components/allocation/consulente/ConsulenteWizard.tsx` (471 lines @ b9411a4d): one `<section>` card
  (`TILE_SURFACE_CLASS mx-auto w-full max-w-[720px] p-5 desktop:p-6`, :202), the eyebrow `<h2>` «Passo n di 8 · tema»
  (:204-206), the headline `<p>` (:209) and the help (:210), the fields per `step` in
  `<div className="mt-5 flex flex-col gap-4">` (:212-330), the footer «Indietro / Avanti» (:332-352), «Avvia la
  ricerca» on the summary (:343-345, «Servizio AI non configurato» without `configured`). No motion: a step change
  re-renders in place, and focus stays on the button pressed, or falls to `body` when that button unmounts («Avanti»
  on step 7 → 8, a Summary row, «Aggiungi un obiettivo»). The run replaces the card (:185-188).
- The same rows typed twice: the Wizard's local `ChoiceRows` (:118-145: no accessible name on the group,
  `description: string` required) and the exported one of `components/assets/compravendita/fields.tsx:22-50`
  (`label` → `aria-label`, `description?`). Call sites: the Wizard's `loss` (:236), `policy` (:251), `RoleBlock` (:373,
  used three times at :281-283) and the goal's priority in `GoalFields` (:406-415);
  `components/assets/compravendita/CompravenditaScreens.tsx` six times (:100 re-kind, :101 re-event, :174 re-owner,
  :269 re-home-insurance, :340 re-life-N-mode, :451 re-center).
- `ConsulenteRun.tsx` (70 lines): the four `ALLOCATION_ADVICE_STAGES` as `<ol aria-label="Le fasi">` with a check, a
  spinner or a dot; in `failed` no stage is marked (`reached = -1`, :28-29), so a failure at the instruments shows the
  strategy undone; no typical duration, no elapsed time; the one live region is the headline (:34).
  `ConsulenteRunState.running` holds `{ answers, stage }` only (`useConsulenteRun.ts:28 @ ce26af4d`): nothing records
  when a stage began.
- `ConsulenteReport.tsx` (397 lines): the running view (:154-173) has its own `<ol>` with the suffixes « · in corso» /
  « · fatto»; the column `flex flex-col gap-3` (:176-396) holds the `PageVerdict` and the tiles «Allocazione
  proposta», «Strumenti», «Obiettivi», «Ruoli degli asset», «Il report», «Chiedi una modifica», «La strategia» (only
  without a report, :338) and «Applica». Nothing marks what the model wrote beyond the aside `model · date`, and
  `Tile` (`components/ui/tile.tsx:225-275 @ ce26af4d`) cannot colour its eyebrow: `className` reaches the section only.
- Motion that exists: `lib/utils/motionVariants.ts` (`staggerContainer`, `cardItem`, `fadeVariants`, `tabPanelSwitch`,
  the private `easeOutQuart = [0.25, 1, 0.5, 1]`; no test file); `--ease-spring` (`app/globals.css:66-71`, the 400/35
  spring sampled over 300 ms); the Panoramica's cascade once per session — a page-local FLAG
  `const tileGridEntrance = { played: false }` (`app/dashboard/page.tsx:168`) read in a `useState` initializer
  (:231), set in an effect (:391-394), with `staggerContainer` on the grid and `cardItem` on every cell (:523-541);
  `useCountUp` (`lib/utils/useCountUp.ts:105`, default 500 ms, `once`); `AnimatePresence mode="wait" initial={false}`
  in `CashflowSankeyChart.tsx:78`; ONE `<MotionConfig reducedMotion="user">` (`components/providers/MotionProvider.tsx`),
  which strips transforms and keeps opacity.
- The accent: `--ai-accent: oklch(0.65 0.2 305)` in `:root` (`app/globals.css:96`) and `.dark` (:156), 3.5:1 on the
  light `--card` (an eyebrow needs 4.5:1); its one consumer is Rendimenti's «Analizza con AI»
  (`app/dashboard/performance/page.tsx:299 @ ce26af4d`: hover border, text and a glow written inline as
  `color-mix(in_oklch,var(--ai-accent)_40%,transparent)`).
- Tests: no DOM harness. `vitest.config.ts` collects `__tests__/**/*.test.ts` only, there is no jsdom and no Testing
  Library; components are rendered with `renderToStaticMarkup` inside `.test.ts` (`evoluzioneTileChips`,
  `pensionRendimentoTile`). Vitest is 4.1, where `environmentMatchGlobs` no longer exists and `test.projects` does.
- E2E: `e2e/allocation.consulente.spec.ts` asserts `heading /Passo N di 8/`, the `#consulente-*` ids, `radio` by
  name, `radiogroup` count 3 on step 6 (:110), «Avvia la ricerca» visible (:126) and never pressed; `walkGoals`
  (:41-48) counts `#consulente-missing` with a non-retrying `count()` straight after a click.
- `__tests__/reactCompilerCoverage.test.ts` compiles every file under `app`, `components`, `contexts` and `lib` (:28)
  and fails on any component the compiler skips.

## 2. Goal and acceptance criteria

The Consulente's three views follow DESIGN.md § 5 «AI Surfaces» as it stands (2026-11-06); the choice rows are one
primitive; component tests get a DOM harness; nothing the path ASKS changes.

1. **`ChoiceList` is the only choice-rows component**: `components/ui/choice-list.tsx` (new) with the contract of
   § 4, used by the Wizard (four kinds of call, six groups) and the Compravendita (six); both `ChoiceRows` are gone.
   Proof: `grep -rn "function ChoiceRows" components` → 0; `__tests__/choiceList.test.tsx` (new);
   `e2e/allocation.consulente.spec.ts` and `e2e/assets.compravendita.spec.ts` green with their assertions unchanged.
   Mutation: drop `aria-label={label}` → `getByRole('radiogroup', { name: 'Tolleranza alle perdite' })` throws; let an
   `exclusive` row keep the others → the exclusivity test reads two values; give the «Altro…» input `autoFocus` → the
   focus assertion is red; drop `itemProps(i)` from the checkboxes → the one-Tab-stop test is red.
2. **The Path-Scene Rule is implemented**: `PathRail` beside the card at 1440 and above it below; the screen slides
   in the direction of travel; after a change the headline takes the focus, on a mount nothing moves. Proof:
   `__tests__/pathRail.test.tsx` (new), `__tests__/motionVariants.test.ts` (new), `e2e/allocation.consulente.spec.ts`
   (the rail beside the card, `aria-current` moving, the focused headline), `e2e/allocation.consulente.mobile.spec.ts`
   (new: the strip, the sampled transform, reduced motion). Mutation: put the interview's ticks inside the path's
   `<ol>` → 11 items; swap the sign in `sceneEnter` → red; drop the `focus()` call → the focus assertion is red; drop
   `initial={false}` → the load sample sees a transform.
3. **The run says how long a stage usually takes, how long this one has been going, and which stage failed**:
   `STAGE_TYPICAL_MINUTES` and `describeStageTypical` (decision 50), `stageStartedAt` on the running state,
   `runStageStates`, `StageRows` shared by the run's screen and the report's running view, the run rail (decision
   51); the headline stays the ONE live region. Proof: `__tests__/allocationAdviceNarrative.test.ts`,
   `__tests__/allocationAdviceDocument.test.ts`, `__tests__/consulenteRun.test.tsx` (new),
   `__tests__/useConsulenteRun.test.tsx` (new), the faked-run test of `e2e/allocation.consulente.spec.ts`. Mutation:
   return the string for 0 minutes → the `context` assertion is red; stamp `stageStartedAt` in `start` only → the
   hook test reads the old time; map a failure to «nothing done» → the `data-state` sequence is red; take
   `aria-hidden` off the elapsed time → red.
4. **The report marks what the model wrote, enters once, and counts the proposal** (decision 49): `generated` on
   every tile except «Applica» and «Chiedi una modifica»; the column cascades the first time the report opens in a
   JS session, never under reduced motion; the proposed percentages count up with the cascade. Proof:
   `__tests__/tile.test.tsx` (new), `e2e/allocation.consulente.report.spec.ts` (new). Mutation: put `generated` on
   «Applica» → the count reads 5; drop the effect that sets `consulenteReportEntrance.played` → the second opening
   cascades; drop `reduced !== true` from the initializer → the reduced-motion opening fades; print the value without
   `useCountUp` → a single text is sampled.
5. **The accent tokens and the controls that call the model** (decision 36): one `--ai-accent` per mode (the light
   value `oklch(0.56 0.2 305)` of DESIGN.md → The AI-Accent Rule in `:root`), `--ai-glow` once; «Avvia la ricerca», «Riprova», «Rivedi il report» and «Analizza
   con AI» glow on hover and focus only. Proof: `grep -c -- "--ai-accent:" app/globals.css` → 2,
   `grep -c -- "--ai-glow:" app/globals.css` → 1, `grep -c "ai-accent-light" app/globals.css` → 0; the class
   assertions in `e2e/allocation.consulente.spec.ts` («Avvia la ricerca»), `__tests__/consulenteRun.test.tsx`
   («Riprova») and `e2e/allocation.consulente.report.spec.ts` («Rivedi il report»). Mutation: copy `--ai-glow` into
   `.dark` → the count reads 2; drop `AI_CONTROL_ACCENT_CLASS` from «Riprova» → red.
6. **Nothing the path asks changes**: `allocationAdviceDraftReducer`, `allocationAdviceAnswersSchema`, the
   `#consulente-*` ids, the button labels, «Passo N di 8», the Summary's content; the option words (only the key
   `description` becomes `hint`). Proof: `__tests__/allocationAdviceDraft.test.ts` and
   `__tests__/allocationAdviceProposal.test.ts` untouched and green; the existing assertions of
   `e2e/allocation.consulente.spec.ts` unchanged, `walkGoals` waiting for the new screen before it counts. Mutation:
   rename «Avanti» → the existing spec is red.
7. **React Compiler coverage**: `__tests__/reactCompilerCoverage.test.ts` green and unchanged (it already compiles
   every new and changed file). Mutation: hold `direction` in a ref read for `custom` → the Wizard is skipped → red.
8. **Bundle and first screen**: `npm run perf:build && npm run perf:budget -- --dist=.next-perf` exit 0 — it measures
   the shared chunks only, because the Consulente route is dynamic (`await searchParams`) and `perf/budget.json`
   holds no key for it; the gzip size of the Consulente page's chunks before and after is recorded in
   `SESSION_NOTES.md` (§ 6 Perf). The Consulente is not a `mobile:budget` surface (`perf/mobile-budget.json` has no
   entry, `doc/guide/consulente.md` § Composizione mobile) and none is added; `mobile:census` and `mobile:budget` are
   not run. Mutation: import `recharts` from `components/ui/tile.tsx` → `perf:budget` is red (the shared ceiling and
   `libraryCopies`).
9. **The phone**: at 390 the strip sits above the card, every `ChoiceList` label (the tap target) is ≥ 44px tall, and `main` never
   scrolls sideways, at rest and during a slide. Proof: `e2e/allocation.consulente.mobile.spec.ts` (new). Mutation:
   drop `min-h-11` from the row's label → the «Media» label of «Priorità» measures ~42px (its two lines) → red; give the card
   `min-w-[420px]` → the overflow guard is red.
10. **The DOM harness** (decision 21): `jsdom`, `@testing-library/react`, `@testing-library/dom`,
    `@testing-library/user-event` as devDependencies; `vitest.config.ts` with two projects (`node` for `.test.ts`, `dom`
    for `.test.tsx`); `__tests__/domSetup.ts` (new); the gate of `doc/guide/dipendenze.md` § How an upgrade is done run once; the row in
    `doc/guide/dipendenze.md` § Registro. Proof: `npx vitest run __tests__/choiceList.test.tsx` passes under jsdom,
    `npx vitest run __tests__/reactCompilerCoverage.test.ts` still under node, `npx vitest run` in both zones green.
    Mutation: drop the `dom` project → `npx vitest run __tests__/choiceList.test.tsx` exits 1 «No test files found».

## 3. Decisions

- **Decision 14**: the scope is the path, the run and the report; the Allocazione page does not change.
- **Decisions 15 and 36**: the accent marks what the model wrote — a 1px `--ai-accent` border at rest, the eyebrow in
  the accent, the glow ONLY on hover and focus-visible at `color-mix(in oklch, var(--ai-accent) 40%, transparent)` —
  and, on hover and focus only, every control that calls the model; never at rest on a control, never a fill. The
  light value replaces `--ai-accent` in `:root`; no `--ai-accent-light`; `--ai-glow` once in `:root`.
- **Decision 21**: this spec adds the RTL harness; its component and hook tests are `.test.tsx` with Testing
  Library; the pure helpers keep their `.test.ts`.
- **Decision 22**: § 10 lists only what is definitively not done, or what another spec of the series does.
- **Decisions 33, 34, 35**: Node 24 for every gate; the § 11 prompt stays in Italian; the guides are in English.
- **Decision 37**: the header's one conditional on the concept, settled by decision 74 (B, 2026-11-06).
- **Decision 39**: the real `ANTHROPIC_API_KEY` of `.env.local` reaches `dev:e2e` and enables «Avvia la ricerca»; the
  route is ALWAYS faked with `page.route`, never a spend; this spec writes it into `doc/guide/e2e-emulatori.md`. No
  dummy key in `package.json`.
- **Decision 49**: the accent on every report tile except «Applica» and «Chiedi una modifica»; `Tile` gains
  `generated?: boolean`.
- **Decision 50**: `STAGE_TYPICAL_MINUTES = { context: 0, strategy: 2, instruments: 2, review: 1 }`; «di solito ~N
  min», nothing for 0.
- **Decision 51**: the run rail's fill is stage STATUS: one fill per stage when it becomes active, never a percentage
  nor a remaining time (DESIGN § 1 «No decorative progress bars» does not apply to it; DESIGN.md → The
  Path-Scene Rule holds it, 2026-11-06).
- **Decision 52**: the release line of § 9.
- **Decision 55**: «Altro…» and «Preferisco non dire» are exclusive rows in a multiple choice; `ChoiceList` implements
  `exclusive: true` here, AI-04 flags the rows.
- **The lead's resolutions of 2026-11-01**: `PathRail` accepts `interview` and the Wizard does not pass it (the three
  ticks appear with AI-04, no dead UI between two releases); no tablet spec, the 390 spec covers the strip, the
  screenshots are taken at 390, 768, 1024×768 and 1440.
- **A19, A20, A21** (README § 4): `ChoiceList` replaces both copies; the screen transition on ease-out-quart (0.25 s
  in, 0.18 s out, a 0.15 s fade under reduced motion), the 400/35 spring only for what moves between two states (here
  the rail's fill), `useCountUp` 620 ms once; the accent on what the model wrote and on the controls that call it.
- **Adopted, reversible**: the rail is navigation-free (its ticks are not buttons): the path is linear by design
  (`describeStepBlock` holds «Avanti»), and the Summary's rows — each a button back to its screen (`onGoto`,
  `ConsulenteWizard.tsx:461-466`) — remain the only jumps.
- **Adopted, reversible**: `ChoiceList` has a multiple mode from day one: AI-04's questions and AI-06's details are
  its consumers (the Rule of Three: the Wizard, the Compravendita, the questions).
- **Adopted, reversible**: the slide's direction is component state set by the handler that dispatches, never a ref
  and never derived in the reducer, which stays pure and unchanged.
- **Adopted, reversible**: `PathRail` is ONE shared component in two modes (`components/ui/path-rail.tsx`, AI-04
  extends it); `StageRows` is ONE list for the run's screen and the report's running view.
- **Adopted, reversible**: the accent's classes live in `lib/constants/aiAccent.ts` (the tile, three Consulente
  buttons, Rendimenti's button, and AI-04/AI-05's cards: the Rule of Three).
- **Adopted, reversible**: the count-up plays with the cascade (the first opening of the session), not on every mount.

## 4. Solution

### The DOM harness (decision 21)

- `npm install -D --save-exact jsdom@<exact> @testing-library/react@<exact> @testing-library/dom@<exact> @testing-library/user-event@<exact>`:
  each the newest stable version published at least seven days before the session (WORKFLOW.md rule 8: installed
  by hand, a release a few days old), pinned exact (`--save-exact`, `doc/guide/dipendenze.md` § How an upgrade
  is done). `@testing-library/dom` is the peer of `@testing-library/react` 16 and `@testing-library/user-event` 14 and
  is named on its own line. No `@testing-library/jest-dom`: the assertions read the DOM (`getAttribute(…)` with
  `toBe`, `textContent` with `toContain`, `queryBy…` with `toBeNull`).
- `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'node', include: ['__tests__/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'dom', include: ['__tests__/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['__tests__/domSetup.ts'] } },
    ],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
```

  `extends: true` gives both projects the root's alias; the TSX runs on the automatic runtime because Vite maps the
  tsconfig's `"jsx": "react-jsx"`. `npx vitest run <file>` and `npm test -- <file>` keep working for either kind.
- `__tests__/domSetup.ts` (new; not a `.test.*`, so no project collects it as a suite): `afterEach(cleanup)` (Vitest
  runs without globals, so Testing Library cannot register it itself); a `ResizeObserver` stub (Radix measures the
  hidden input of a radio or a checkbox with it inside a form; jsdom has none); a `window.matchMedia` stub answering
  `matches: false` (framer's `useReducedMotion` and `useCountUp` read it; a test that wants reduced motion replaces it).
- The dependency gate (`doc/guide/dipendenze.md` § How an upgrade is done), once, after the install
  (decision 33: on Node 24): `node -v` (v24); `npx tsc --noEmit`; `npm run lint`; `TZ=Europe/Rome npx vitest run` and
  `TZ=UTC npx vitest run`; `npm run build && npm run perf:budget`;
  `npm run build-storybook -- --quiet -o <scratchpad>/storybook-static`; the emulators restarted (`npm run emulators`,
  `npm run emulators:seed`), :3100 free, `npx playwright test --project=desktop`.

### `ChoiceList` (the shared contract)

```tsx
'use client';

export interface ChoiceListOption<T extends string> {
  value: T;
  label: string;
  /** The second line under the label. */
  hint?: string;
  /** Multiple mode: choosing it clears the others, choosing another clears it (decision 55). */
  exclusive?: boolean;
}

export const CHOICE_ROW_CLASS = 'flex items-start gap-3 px-4 py-3';

export type ChoiceListProps<T extends string> = {
  name: string;
  /** The group's accessible name, required (the question's text inside a QuestionCard). */
  label: string;
  options: readonly ChoiceListOption<T>[];
  /** The «Altro…» row is the option whose value is `other.value`; its field shows while that row is chosen. */
  other?: { value: T; label: string; text: string; onTextChange: (text: string) => void };
} & (
  | { mode: 'single'; value: T | null; onChange: (value: T) => void }
  | { mode: 'multiple'; value: T[]; onChange: (value: T[]) => void }
);

export function ChoiceList<T extends string>(props: ChoiceListProps<T>): React.JSX.Element;
```

- **Single**: the Radix `RadioGroup` of `components/ui/radio-group.tsx` with `value={value ?? ''}` (never `undefined`,
  which would make the group uncontrolled), `onValueChange={(next) => onChange(next as T)}` and `aria-label={label}`.
  The markup of `components/assets/compravendita/fields.tsx:36-48 @ b9411a4d`, moved once: the group
  `divide-y divide-border rounded-xl border border-border`; each row `CHOICE_ROW_CLASS`; `RadioGroupItem`
  `id={`${name}-${option.value}`}` `className="mt-1"`; the `Label` `htmlFor` with
  `flex min-h-11 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 text-left desktop:min-h-0`; the
  label `text-[14px] font-medium text-foreground`, the hint `text-[13px] font-normal leading-[1.45] text-muted-foreground`.
- **Multiple**: `<div role="group" aria-label={label}>` with the same group classes, rows, ids and label classes, a
  `Checkbox` (`components/ui/checkbox.tsx`) in place of the radio, `checked={value.includes(option.value)}`.
  `useRovingFocus(options.length, 'vertical')` is called at the top of the component in both modes (a hook never sits
  behind a branch); `containerProps` on the group, `itemProps(i)` on each checkbox, so the list is ONE Tab stop
  (AGENTS.md § Accessibility). `onCheckedChange` builds the next array in the options' order: turning on an
  `exclusive` row gives `[that]`; turning on another row gives the current values without the exclusive ones, plus
  it; turning a row off removes it.
- **«Altro…»**: under the label of the row whose value is `other.value`, while it is chosen (single:
  `value === other.value`; multiple: `value.includes(other.value)`), an `Input` (`components/ui/input.tsx`) with
  `className="h-11 desktop:h-9"` (the value of the Compravendita's `FIELD_HEIGHT_CLASS`, written here: the primitive
  imports nothing from `components/assets/`), `aria-label={other.label}`, `value={other.text}` and `onChange` →
  `onTextChange`. **No autofocus**: Radix selects a radio as the arrows move onto it, and an autofocus would pull a
  keyboard reader out of the group; the field is the next Tab stop, outside the roving items.
- **The option arrays** rename `description` → `hint`, the words unchanged: `LOSS_TOLERANCE_OPTIONS` and
  `DISTRIBUTION_POLICY_OPTIONS` (`lib/utils/allocationAdviceNarrative.ts:61-71`), `ROLE_OPTIONS_HOME` and
  `ROLE_OPTIONS_FROZEN_FIRST` (`ConsulenteWizard.tsx:147-154`), the priority options (:406-415), `KIND_OPTIONS`,
  `EVENT_OPTIONS` and `LIFE_MODE_OPTIONS` (`CompravenditaScreens.tsx:49-61`, the last typed `hint: string`) and the
  home-insurance options (:269-277).
- **Call sites**, all `mode="single"`: the Wizard's `loss` with `label="Tolleranza alle perdite"`, `policy` with
  «Proventi», `RoleBlock` with its `title`, the priority with «Priorità» (the Summary's row labels and the
  sub-eyebrows already on screen); `name` is unchanged, so the ids are. `CompravenditaScreens.tsx` ×6 keep their
  `name` and `label` (re-kind «Operazione», re-event «Evento», re-owner «Intestatari», re-home-insurance «Polizza
  scoppio e incendio», re-life-N-mode «Come si paga la polizza vita N», re-center «Centro di costo») and import
  `ChoiceList` from `@/components/ui/choice-list`. `fields.tsx` loses `ChoiceRows` and its `RadioGroup` import
  (`FIELD_HEIGHT_CLASS` stays: the other fields use it); the Wizard loses its `ChoiceRows` and its `RadioGroup` import
  (:52, used by nothing else).

### The scene (concept B)

- **`components/ui/path-rail.tsx`** (new):

```tsx
'use client';

export type PathRailProps =
  | { mode: 'path'; steps: readonly string[]; current: number; interview?: { total: 3; reached: number | null } }
  | { mode: 'run'; stages: readonly { label: string; state: 'done' | 'active' | 'pending' | 'failed' }[] };

export function PathRail(props: PathRailProps): React.JSX.Element;
```

- **Path mode**: `<ol aria-label="Il percorso">` of one `<li>` per step, in order; the `<li>` at `current` carries
  `aria-current="step"`; each `<li>` holds its step's name — the Wizard passes
  `ALLOCATION_ADVICE_STEPS.map((step) => STEP_COPY[step].eyebrow)` and `current={draft.step}` — in a `sr-only` span
  below `desktop:` and in `text-[11px]` at 1440 (`font-medium text-foreground` on the current one,
  `text-muted-foreground` on the others). A tick per step: done `bg-foreground/50`, current `bg-foreground`, ahead
  `bg-border`. Below `desktop:` a strip 24px tall (`flex gap-1`, each tick `h-1 flex-1 rounded-full`); at 1440 a
  column (`flex flex-col gap-2`, each `<li>` a `h-4 w-1 rounded-full` tick beside its name). The ticks are not
  buttons and carry no handler.
- **`interview`** (accepted here, passed by AI-04): a sibling `<ol aria-label="Il colloquio">` after the path's list,
  three `<li>` «Tornata N di 3» drawn as ticks; `aria-hidden="true"` and `opacity-50` while `reached === null`; with a
  number, readable, the tornate before `reached` done, `reached` current with `aria-current="step"`, and the path's
  eight all done with no `aria-current` (the rail has ONE current step). Its ticks light in the accent one round at
  a time: `bg-[color:var(--ai-accent)]` on `reached` and on the tornate before it, `bg-border` ahead (DESIGN.md →
  The Path-Scene Rule; decision 78, 2026-11-06).
- **Run mode**: `<ol aria-label="Le fasi" aria-hidden="true">` of four segments (the stage rows of the card are the
  list a screen reader reads): a `bg-border` track with a fill span `origin-left scale-x-0` that becomes `scale-x-100`
  when its stage is `active`, `done` or `failed` (on the 1440 column `origin-top scale-y-0` → `scale-y-100`), with
  `motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-spring`: ONE fill per stage when it
  becomes active (decision 51). The fill is `bg-[color:var(--ai-accent)]` while active, `bg-muted-foreground` when done,
  `bg-destructive` when failed: with the interview's ticks, the only fills the accent is allowed (DESIGN.md → The
  Path-Scene Rule; decision 78, 2026-11-06). Under reduced motion the `motion-safe:`
  transition does not apply and the fill is instant.
- **The layout**: in the Wizard and in `ConsulenteRun`, a wrapper
  `<div className="mx-auto grid w-full max-w-[720px] grid-cols-1 gap-4 desktop:max-w-[900px] desktop:grid-cols-[160px_1fr]">`
  holds `PathRail` and the card's `<section>`, which keeps `mx-auto w-full max-w-[720px]` and gains `overflow-x-clip`
  (not `overflow-hidden`: the fields' focus rings sit inside its `p-5` padding, and the body slides 24px over a 20px
  padding). Below `desktop:` (390, both tablets, a 1280 laptop) the strip is above the card; at 1440 the column is to
  its left; the card does not move between the path and the run.
- **The animated node**: in the Wizard, the headline, the help and the body (:209-330) move into

```tsx
<AnimatePresence mode="wait" initial={false} custom={direction}>
  <motion.div
    key={sceneKey}
    data-scene={sceneKey}
    custom={direction}
    variants={reduced ? sceneVariantsReduced : sceneVariants}
    initial="enter"
    animate="center"
    exit="exit"
    onAnimationComplete={(definition) => definition === 'center' && focusHeadline()}
  >
```

  with `sceneKey = `${draft.step}:${draft.goalIndex}:${answers.goals.length}`` (an added or a removed goal changes
  the length, so `removeGoal`, which keeps `goalIndex` while the content becomes the next goal, plays the scene;
  typing a goal's name changes nothing, so the scene never remounts on a keystroke) and
  `const reduced = useReducedMotion()`. The eyebrow row (:203-207) and the footer (:332-352) stay outside: they do not
  move.
- **`lib/utils/motionVariants.ts`** gains:

```ts
/** The path's screen comes in from the side it is going to: +1 forward, −1 back. */
export function sceneEnter(direction: 1 | -1): { x: number; opacity: number } {
  return { x: 24 * direction, opacity: 0 };
}
export function sceneExit(direction: 1 | -1): { x: number; opacity: number; transition: Transition } {
  return { x: -24 * direction, opacity: 0, transition: { duration: 0.18, ease: easeOutQuart } };
}
export const sceneVariants: Variants = {
  enter: sceneEnter,
  center: { x: 0, opacity: 1, transition: { duration: 0.25, ease: easeOutQuart } },
  exit: sceneExit,
};
export const sceneVariantsReduced: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
/** A question or proposal card entering (DESIGN.md § 5, «Question card, entering»): a translate only, so MotionConfig reducedMotion="user" leaves nothing and the card appears. Read by AI-04 and AI-05. */
export const cardEnterVariants: Variants = {
  enter: { y: 8 },
  center: { y: 0, transition: { duration: 0.2, ease: easeOutQuart } },
};
```

  The resolvers are exported because a `Variant` (`TargetAndTransition | TargetResolver`) is not callable in a test.
- **The direction**: `const [direction, setDirection] = useState<1 | -1>(1)`, set in the SAME handler as the
  dispatch: «Avanti» and «Aggiungi un obiettivo» → 1; «Indietro», a Summary row (`goto`) and «Rimuovi questo
  obiettivo» → −1. Never a ref: reading a ref for `custom` during render makes the compiler skip the whole Wizard.
- **The focus**: the headline `<p>` takes `tabIndex={-1}`, `outline-none` and a ref. The same handlers store the
  element focused at the gesture in `pendingFocus` (a ref, read only in callbacks). `focusHeadline`, called only from
  `onAnimationComplete`, focuses the headline with `{ preventScroll: true }` when `pendingFocus.current` is set and
  `document.activeElement` is still that element or `document.body` (the pressed button unmounted), then clears it: a
  reader who already tapped a field or opened a `Select` of the new screen keeps it. With `initial={false}` the first
  screen of a mount (a load, a reload with a draft, «Rifai il percorso», «Torna al riepilogo») is drawn in place and
  nothing is focused.
- The new hooks of the Wizard (`useState` for the direction, two `useRef`, `useReducedMotion`) sit before its early
  `return <ConsulenteRun …/>` (:185-188). «Avvia la ricerca» (:343-345) takes `AI_CONTROL_ACCENT_CLASS`.

### The run

- **`useConsulenteRun.ts`**: `running` gains `stageStartedAt: number`, stamped with `Date.now()` in `start` (the
  `setState` that opens the run) and in the `onStage` callback of `requestStage` (event time, never render):

```ts
| { kind: 'running'; answers: AllocationAdviceAnswers; stage: AllocationAdviceStage | null; stageStartedAt: number }
```

  «Riprova» re-enters `running` at `resumeFrom` through `start`, so the retried stage's clock starts at the retry.
- **`lib/utils/allocationAdviceNarrative.ts`** (decision 50; about five minutes in all at effort `medium`, 2026-10-23):

```ts
export const STAGE_TYPICAL_MINUTES: Record<AllocationAdviceStage, number> = { context: 0, strategy: 2, instruments: 2, review: 1 };
/** «di solito ~N min»; null when N is 0 (the context: the row prints no duration). */
export function describeStageTypical(stage: AllocationAdviceStage): string | null;
```

- **`lib/utils/allocationAdviceDocument.ts`**:

```ts
export type StageRowState = 'done' | 'active' | 'pending' | 'failed';
/** The display stage of a run request: `revise` re-enters the review. */
export function stageOfRunStage(stage: AllocationAdviceRunStage): AllocationAdviceStage;
export function runStageStates(at: { status: 'running' | 'failed' | 'done'; stage: AllocationAdviceStage | null }): { stage: AllocationAdviceStage; state: StageRowState }[];
```

  `running`: the stages before `stage` done, `stage` active, the rest pending (`null`: all pending); `failed`: the
  stages before `stage` done, `stage` failed, the rest pending; `done`: all done. `ConsulenteRun` passes
  `{ status: 'failed', stage: stageOfRunStage(state.resumeFrom) }` for a failure; the report's running view passes
  `{ status: 'running', stage: document.stage }`.
- **`ConsulenteRun.tsx`** exports `StageRows({ rows, elapsed }: { rows: readonly { stage: AllocationAdviceStage; state: StageRowState }[]; elapsed?: string })`:
  `<ol aria-label="Le fasi" className="divide-y divide-border rounded-xl border border-border">`, each
  `<li data-state={state}>` with its icon (done `Check` in `text-positive`, active `Loader2` spinning, pending a
  `bg-border` dot, failed a `bg-destructive` dot), `STAGE_COPY[stage].label` and `.detail`, `describeStageTypical`
  on the right (`font-mono text-[12px] tabular-nums text-muted-foreground`), on the active row `elapsed` beside it
  with `aria-hidden="true"`, and a `sr-only` state word («, fatto», «, in corso», «, non riuscito»; none for pending).
  The active row takes `AI_GENERATED_SURFACE_CLASS` — the 1px `--ai-accent` border at rest and the glow on hover
  and focus-visible, «the run's active stage» of DESIGN.md → The AI-Accent Rule (A21; decision 78, 2026-11-06) —
  and no left border.
- `useElapsed(since: number): string`, local to `ConsulenteRun.tsx`: `now` in state, a 1 s `setInterval` in an effect
  cleared on unmount, «m:ss» of `Math.max(0, now - since)`.
- `ConsulenteRun` renders the wrapper with `PathRail mode="run"` (the stages from `runStageStates` labelled with
  `STAGE_COPY[stage].label`) and the card: the headline (the ONE live region, unchanged), the error sentence,
  `StageRows` (with `elapsed` only while running), «Puoi lasciare la pagina: ogni fase viene salvata appena finisce.»
  and, after a failure, «Torna al riepilogo» and «Riprova» (`AI_CONTROL_ACCENT_CLASS`).

### The report

- **`Tile`** (`components/ui/tile.tsx`): `TileBaseProps` gains `generated?: boolean`. The plain branch's section takes
  `cn(TILE_SURFACE_CLASS, 'p-5', generated && AI_GENERATED_SURFACE_CLASS, className)` and `data-generated=""`, its
  `<h3>` `cn(TILE_EYEBROW_CLASS, generated && AI_GENERATED_EYEBROW_CLASS)`; in the collapse branch the label takes
  `AI_GENERATED_EYEBROW_CLASS` unless `collapse.failed` (the red wins) and `TileRowShell` gains `generated?: boolean`
  with the same section class and attribute. The eyebrow's words do not change, so neither does the section's
  accessible name (the aside already names the model).
- **`lib/constants/aiAccent.ts`** (new):

```ts
/** What the model wrote: the 1px accent border at rest; the glow on hover and while a control inside has the keyboard focus (decision 36). */
export const AI_GENERATED_SURFACE_CLASS =
  'border-[color:var(--ai-accent)] motion-safe:transition-shadow motion-safe:duration-200 hover:shadow-[0_0_14px_var(--ai-glow)] has-[:focus-visible]:shadow-[0_0_14px_var(--ai-glow)]';
export const AI_GENERATED_EYEBROW_CLASS = 'text-[color:var(--ai-accent)]';
/**
 * A control that calls the model (The AI-Accent Rule): on hover and on keyboard focus only, the border turns the
 * accent and the glow appears, over 200 ms; never at rest, never a fill. The focus ring stays `ring-ring`.
 */
export const AI_CONTROL_ACCENT_CLASS =
  'transition-[border-color,color,box-shadow] duration-200 hover:border-[color:var(--ai-accent)] focus-visible:border-[color:var(--ai-accent)] hover:shadow-[0_0_14px_var(--ai-glow)] focus-visible:shadow-[0_0_14px_var(--ai-glow)]';
/** Added to AI_CONTROL_ACCENT_CLASS on an outline or ghost control only: its label turns the accent too; a filled control keeps --primary-foreground. */
export const AI_CONTROL_ACCENT_LABEL_CLASS = 'hover:text-[color:var(--ai-accent)] focus-visible:text-[color:var(--ai-accent)]';
```

- **`ConsulenteReport.tsx`**: `generated` on «Allocazione proposta», «Strumenti», «Obiettivi», «Ruoli degli asset»,
  «Il report», «La strategia» and, in the running view, «Le fasi»; never on «Applica» nor «Chiedi una modifica»
  (decision 49; AI-04's «Il colloquio» stays without it, decision 79). «Rivedi il report» takes `AI_CONTROL_ACCENT_CLASS`.
- **The running view** (:154-173): «Le fasi» holds `StageRows rows={runStageStates({ status: 'running', stage: document.stage })}`
  with no `elapsed` (a reload does not know when the stage began; the aside keeps «avviato il …»); it does not
  cascade.
- **The cascade**: a module-level `const consulenteReportEntrance = { played: false };` (its own flag: the
  Panoramica's stays page-local). Before the early return: `const reduced = useReducedMotion();`,
  `const [playsEntrance] = useState(() => !consulenteReportEntrance.played && reduced !== true);` and
  `useEffect(() => { if (document.status !== 'running') consulenteReportEntrance.played = true; }, [document.status]);`.
  The ready and failed column becomes
  `<motion.div data-consulente-report="" className="flex flex-col gap-3" variants={staggerContainer} initial={playsEntrance ? 'hidden' : false} animate="visible">`
  and each child — the `PageVerdict` and every tile — is wrapped in `<motion.div variants={cardItem}>`, the tile's
  condition moved outside its wrapper. Once per JS session: a reload plays it again, a client navigation back does
  not, reduced motion never (`MotionConfig` would keep an opacity stagger).
- **The count-up**: a leaf `ProposedPct({ value, animate }: { value: number; animate: boolean })` in
  `ConsulenteReport.tsx` calls `useCountUp(animate ? value : null, { once: true, duration: 620 })` unconditionally and
  prints `formatPercentageIt(animate && counted !== null ? counted : value, 1)` in `<span data-proposed-pct="">`;
  `animate` is `playsEntrance`. Only the PROPOSED percentage of a row without `fixedAmount` counts; today's
  percentage, the delta points, a fixed amount and the sub-target percentages print as today. Under reduced motion
  `useCountUp` lands on the value by its own branch.

### Tokens, the other controls, the comments

- **`app/globals.css`**: in `:root` (:96) the light-mode value of DESIGN.md § 5 «AI
  Surfaces», `oklch(0.56 0.2 305)`, replaces `oklch(0.65 0.2 305)`; `.dark` (:156) keeps `oklch(0.65 0.2 305)`;
  `--ai-glow: color-mix(in oklch, var(--ai-accent) 40%, transparent);` once, in `:root` under `--ai-accent` (`.dark`
  sits on `<html>`, the same element, so the glow follows the dark accent with no copy). No `--ai-accent-light`.
- **`app/dashboard/performance/page.tsx:299 @ ce26af4d`** («Analizza con AI», decision 36): the inline
  `hover:shadow-[0_0_14px_color-mix(in_oklch,var(--ai-accent)_40%,transparent)]` becomes `AI_CONTROL_ACCENT_CLASS` +
  `AI_CONTROL_ACCENT_LABEL_CLASS` (an outline control), which carry the same border, text and glow and add the
  `focus-visible:` pair; the colour, the timing and the icon unchanged.
- **Comments**: `ConsulenteClient.tsx`'s header «the page is one column at 720px» → «the page is one column at 720px
  (900px at 1440, the path's rail beside the card)»; the header of `e2e/allocation.consulente.spec.ts` is rewritten in
  English, its paragraph «NON avvia mai la ricerca…» becoming «It presses «Avvia la ricerca» only on a route faked
  with `page.route`: the `.env.local` key enables the button, no request reaches the server
  (doc/guide/e2e-emulatori.md § Browser-Driven E2E).»

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **doc/guide/motion.md and AGENTS.md § React Compiler and the hooks rules** — here it means the `AnimatePresence` child is keyed and
  pure, `direction` is state, the refs are read in callbacks only, `useReducedMotion()` is called once per component,
  no CSS media query for motion, the new hooks sit before the early returns of the Wizard (:185) and of the report
  (:154); `reactCompilerCoverage` is the gate.
- **DESIGN § 1 and A20** — here it means ease-out-quart, 0.25 s in and 0.18 s out, a 0.15 / 0.1 s fade under reduced
  motion; the 400/35 spring (`--ease-spring`) only for the rail's fill, which moves between two states.
- **DESIGN → The One-Eyebrow Rule** — here it means the card's eyebrow stays the one; the rail's names are list items
  in 11px at 1440 and `sr-only` below; an accented eyebrow changes colour, never size.
- **DESIGN → The Modal-Is-A-Tile Rule (no card in a card)** — here it means the rail is outside the card, and
  `ChoiceList` and `StageRows` are bordered lists inside it, never tiles.
- **AGENTS.md § Accessibility** — here it means 44px rows (`min-h-11` on the label below `desktop:`), the footer
  buttons `h-11 desktop:h-9`, the ticks are not targets; ONE live region (the run's headline): the elapsed time is
  `aria-hidden` (it would speak every second) and the state words are plain `sr-only` text; a list of same-kind
  controls is ONE Tab stop (Radix in single mode, `useRovingFocus` in multiple mode).
- **AGENTS.md § Tailwind Breakpoints** — here it means `desktop:` is 1440, so the vertical rail exists from 1440 only;
  the 390 guard is the repo's: `main.scrollWidth === main.clientWidth` plus the walk of `main *` with `.sr-only` and
  `.overflow-x-auto` excluded (`e2e/fire.mobile.spec.ts:104-124 @ ce26af4d`), which skips the rail's hidden names.
- **E2E (doc/guide/e2e-emulatori.md § Browser-Driven E2E)** — here it means the FILENAME picks the project (`.spec.ts`
  desktop, `.mobile.spec.ts` mobile, both on the base account `test-user-1`), `workers: 1`, and a spec that edits
  `allocationAdvice/test-user-1` RESTORES what it read («A spec that edits a document another fixture also writes
  RESTORES what it read, never deletes»); a spec cannot import `lib/`, so its documents are literals.
- **A probe never spends** (README § 8, decision 39) — here it means every press of «Avvia la ricerca» and «Riprova»
  in a spec is answered by `page.route`, installed before the click.
- **No owner data** (WORKFLOW.md § 1.6) — here it means the planted documents carry invented round figures and the
  decoys «ornitorinco» and «fenicottero»; phase F reads the owner's last report on the preview and copies nothing.
- **Edge cases**:
  - a failure of the context read happens inside the strategy request: `resumeFrom` is `strategy`, the rows read
    «Leggo il portafoglio» done and «Propongo la strategia» failed, and the error sentence under the headline says
    what failed;
  - a reload mid-run shows the report's running view (`pageShowsReport`, `lib/utils/allocationAdviceDocument.ts:41 @ ce26af4d`):
    the same `StageRows`, «Le fasi» accented, no elapsed time, no cascade;
  - during the 0.18 s exit (`mode="wait"`) the eyebrow and the footer already read the new step while the old body
    leaves: a spec waits for a control of the new screen, never counts with a non-retrying `count()`;
  - the faked route answers a request whole, so a state between two events of one request cannot be held: the test
    holds a whole REQUEST (the retried instruments) to read the active row;
  - the faked run ends on the run screen's «La proposta è pronta.»: nothing is written, the document in the emulators
    is the one the spec found (or none), and the page stays on `ConsulenteRun` because `run.state` is `done`;
  - after «Torna al riepilogo» the Wizard's card mounts again: `initial={false}` draws it in place.
- **Cases that do not change**: the demo (`ConsulenteClient` returns its `EmptyState` before the Wizard,
  `ConsulenteClient.tsx:96-103 @ ce26af4d`); a shared-account viewer (the draft, the run and the report already read
  `ownerId`; `ChoiceList` and `PathRail` hold no account state); a stale run (`isRunStale`: the Wizard reopens, the
  rail shows the draft's step, the first screen is drawn in place); cost centres, Divisione and empty collections (the
  path asks nothing about them and no question changes); the Compravendita's screens (the same rows, labels, ids and
  44px; only the component and its file); `ExchangeField` (a `Select` with `EXCHANGE_OTHER`, `allocationAdviceNarrative.ts:75`).

## 6. Tests per level (with the mutation that proves each)

**Vitest** (both zones; the `.test.tsx` files run in the `dom` project with Testing Library):

- `__tests__/choiceList.test.tsx` (new): single — `getByRole('radiogroup', { name })` with one radio per option,
  `value: null` leaves every `aria-checked` at `false`, a click on «Due» calls `onChange('b')`, the ids
  `#prova-a`… exist; multiple — `getByRole('group', { name })` of checkboxes, `['a']` + a click on «Due» gives
  `['a', 'b']`, `['a', 'b']` + the exclusive row gives `['x']`, `['x']` + «Uno» gives `['a']`; one Tab stop —
  `user.tab()` focuses the first checkbox, `{ArrowDown}` the second, `user.tab()` leaves the group; «Altro…» — chosen,
  `getByRole('textbox', { name: other.label })` holds `other.text` and typing calls `onTextChange`; not chosen, the
  textbox is absent; choosing it does not move the focus into the field (`document.activeElement` is not the
  textbox). Invented options («Uno», «Due», «Altro…», «Preferisco non dire»). Mutations: § 2 criterion 1.
- `__tests__/pathRail.test.tsx` (new): path mode — «Il percorso» with 8 `listitem`, exactly one `[aria-current="step"]`
  whose text is `STEP_COPY.borsa.eyebrow` at `current={2}`; no `interview` → no «Il colloquio» list even with
  `{ hidden: true }`; `reached: null` → the list found only with `{ hidden: true }`, `aria-hidden="true"`, three items,
  the path keeps its current step; `reached: 1` → the list readable, the current step on its second item, none on the
  path, one `[aria-current]` in the container; run mode — `ol[aria-label="Le fasi"]` with `aria-hidden="true"` and
  four `li` whose `data-state` follow the input. Mutation: the interview's items inside the path's `<ol>` → 11 → red;
  `aria-current` on both lists → 2 → red.
- `__tests__/tile.test.tsx` (new): `generated` → the region «Il report» has `data-generated` and the accent border
  class, its heading the accent text class; without it, neither; the collapse branch (`{ id: 't', open: true,
  mounted: true, failed: false, onOpenChange() {} }`) carries both too; with `failed: true` the label keeps
  `text-destructive` and not the accent. Mutation: drop `data-generated` → red; let the accent win over a failed row
  → red.
- `__tests__/consulenteRun.test.tsx` (new): fake timers at a noon fixture (`2026-06-15T12:00:00`); `running` at
  `strategy` with `stageStartedAt` 61 s earlier → one `[aria-live]` in the container, the `li[data-state="active"]`
  reads «Propongo la strategia» and «di solito ~2 min», the done row «Leggo il portafoglio» carries no «di solito»,
  the text «1:01» sits in an `aria-hidden="true"` node and reads «1:02» after `vi.advanceTimersByTime(1000)`;
  `failed` with `resumeFrom: 'instruments'` and `retryable: true` → `data-state` done · done · failed · pending, no
  `m:ss` text, «Riprova» carries `AI_CONTROL_ACCENT_CLASS`; `done` → four done and «La proposta è pronta.».
  Mutations: § 2 criterion 3.
- `__tests__/useConsulenteRun.test.tsx` (new, `renderHook` in a `QueryClientProvider`): `@/lib/utils/authFetch` mocked,
  each request answered by a `Response` over a `ReadableStream` the test feeds with `data: {json}\n\n` events;
  `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime`; the answers from `initialAnswers(null, null, [])`.
  `start` → `running`, `stage: null`, `stageStartedAt` = T0; at T1 the event `stage: context` → `stageStartedAt` = T1;
  at T2 `strategy` → T2; an `error` on the instruments → `failed` with `resumeFrom: 'instruments'`; `retry` at T3 →
  `running` at `instruments` with T3. Mutation: stamp the time in `start` only → the T1 assertion is red.
- `__tests__/motionVariants.test.ts` (new, node): `sceneEnter(1).x === 24`, `sceneEnter(-1).x === -24`,
  `sceneExit(1).x === -24` with `transition.duration === 0.18`, the center's duration 0.25, no key of
  `sceneVariantsReduced` holds an `x`; `cardEnterVariants.enter` holds `y: 8` and no `opacity` (decision 78: a
  translate only). Mutation: swap the sign in `sceneEnter` → red; add `opacity: 0` to `cardEnterVariants.enter` → red.
- `__tests__/allocationAdviceNarrative.test.ts` (extended): `STAGE_TYPICAL_MINUTES` holds the four stages with
  0 · 2 · 2 · 1; `describeStageTypical('strategy')` is «di solito ~2 min», `describeStageTypical('context')` is null.
  Mutation: return the string for 0 → red.
- `__tests__/allocationAdviceDocument.test.ts` (extended): `runStageStates` for `running` at `null` and at
  `instruments`, for `failed` at `strategy` and at `review`, for `done`; `stageOfRunStage('revise') === 'review'`.
  Mutation: mark the failed stage `pending` → red.
- `__tests__/reactCompilerCoverage.test.ts` unchanged and green; `allocationAdviceDraft` and
  `allocationAdviceProposal` untouched and green.

**Playwright** (emulators + `dev:e2e` on :3100):

- `e2e/consulentePath.ts` (new; a helper, no project collects it): `openConsulente`, `next` and `walkGoals` moved out
  of the spec, plus `walkToSummary(page)` (age 35, horizon 20, «Media», the default exchange, «Accumulazione», the
  goals walked, the roles and the constraints left as they are). `walkGoals` waits after every `next(page)` with
  `await expect(page.locator('#consulente-missing').or(page.locator('input[id^="goal-"][id$="-name"]'))).toBeVisible()`
  before it counts.
- `e2e/allocation.consulente.spec.ts` (desktop): every existing assertion unchanged, plus — the list «Il percorso»
  with 8 items, `aria-current="step"` on «Chi sei» then on «Le perdite» after «Avanti», the rail's right edge left of
  the card's left edge; after «Avanti» the headline of `[data-scene]` is focused (`toBeFocused`); «Avvia la ricerca»
  `toHaveClass(/var\(--ai-glow\)/)`. A new test **«runs the three stages on a faked route, a failed stage retried from
  itself»**: `page.route('**/api/allocation-advice/run', …)` installed first, reading `postDataJSON().stage` and
  recording it; `walkToSummary`; «Avvia la ricerca» is enabled (the `.env.local` key, decision 39); the strategy
  request answers `stage: context`, `stage: strategy`, `done`; the first instruments request answers
  `stage: instruments` and `{ type: 'error', error: 'Ricerca finta interrotta: ornitorinco.', retryable: true }` → the
  headline «Il percorso non si è concluso.», the decoy sentence, `data-state` done · done · failed · pending,
  «Riprova» visible; «Riprova» → the second instruments request is HELD: «Cerco gli strumenti» is
  `data-state="active"` with «di solito ~2 min» and an elapsed `/^\d+:\d\d$/`, `ol[aria-label="Le fasi"][aria-hidden="true"]`
  is present, one `[aria-live]` in the card; released → `stage: instruments`, `done`; the review → `stage: review`,
  `done`; the headline «La proposta è pronta.»; the recorded order is strategy · instruments · instruments · review,
  only the strategy's body carries `answers`. Mutation: let «Riprova» restart from the strategy → the order is red.
- `e2e/allocation.consulente.mobile.spec.ts` (new, 390): an `addInitScript` rAF probe records, every frame, the
  computed `transform` of each `[data-scene]` and `main.scrollWidth - main.clientWidth`. On the load (through
  `openConsulente`) every transform is `none`; after «Avanti» at least one sample is not `none` (the probe sees the
  slide) and every overflow sample is 0; the list «Il percorso» ends above the card; the repo's overflow guard at
  rest on step 1 and on step 5; on the new goal's screen («Aggiungi un obiettivo» after `walkGoals`) every label of
  `getByRole('radiogroup', { name: 'Priorità' })` is ≥ 44px tall. A describe with
  `test.use({ contextOptions: { reducedMotion: 'reduce' } })`: after «Avanti» every sample is `none` and the headline
  is still focused. Mutation: pass `sceneVariants` regardless of `reduced` and take `reducedMotion="user"` off
  `MotionProvider` → the reduced describe is red; use `sceneVariantsReduced` always → the first describe is red.
- `e2e/allocation.consulente.report.spec.ts` (new, desktop): a firebase-admin helper in the spec (the `admin()` of
  `e2e/assets.compravendita.spec.ts:41-46 @ ce26af4d`, with `FIRESTORE_EMULATOR_HOST` and `GCLOUD_PROJECT` set as
  there) reads `allocationAdvice/test-user-1` in `beforeAll` and, in `afterAll`, writes it back or deletes it when it
  was absent. Each test plants its own literal document — every date a Firestore `Timestamp`, the answers shaped by
  `allocationAdviceAnswersSchema` (`lib/utils/allocationAdviceProposal.ts:54 @ b9411a4d`), the proposal by
  `allocationAdviceProposalSchema` (:136): two classes at 70 and 30, one goal «Fondo fenicottero» with an assignment
  on «ETF ornitorinco», `assetRoles: []` — and opens `/dashboard/allocation/consulente`. An `addInitScript` probe
  records the least opacity among the children of `[data-consulente-report]` and the texts of the first
  `[data-proposed-pct]`.
  - `ready` with instruments and a report: `[data-generated]` count 4 (Allocazione proposta, Strumenti, Obiettivi, Il
    report); the regions «Applica» and «Chiedi una modifica» `not.toHaveAttribute('data-generated')`; the least
    opacity < 0.5; more than one text sampled and the last «70,0%»; «Rivedi il report» `toHaveClass(/var\(--ai-glow\)/)`;
    then «Torna all'Allocazione», the «Consulente» link, the probe reset → the least opacity 1 and the one text
    «70,0%».
  - `failed` with a strategy and no report: the region «La strategia» has `data-generated`, «Applica» has not.
  - `running` at `instruments`, `startedAt` now: the region «Le fasi» has `data-generated`, its
    `li[data-state="active"]` reads «Cerco gli strumenti» and «di solito ~2 min», no text `/\d+:\d\d/` in it.
  - a describe with reduced motion, `ready`: the least opacity 1, one text sampled.
  Mutations: § 2 criterion 4.
- `e2e/assets.compravendita.spec.ts`: green and unchanged.

**Perf**: `npm run perf:build && npm run perf:budget -- --dist=.next-perf` exit 0. The Consulente page's own weight,
before the change (a `perf:build` of the branch point, before the first edit) and after: the gzip sum of the files
listed under `entryJSFiles['[project]/app/dashboard/allocation/consulente/page']` in
`.next-perf/server/app/dashboard/allocation/consulente/page_client-reference-manifest.js`, by a scratchpad script;
both figures go in `SESSION_NOTES.md` and then in the commit message. No ceiling is added.

## 7. Guided verification (WORKFLOW.md § 2)

The expected outcome, declared first: «the path slides screen to screen beside a rail that says where you are; the
run says how long each stage usually takes, how long this one has been going and which one failed; the report marks
every tile the model wrote and enters once; the eight questions are the same; component tests run under jsdom».

- **A — Invarianza**: `node -v` (24); `npx tsc --noEmit`; `npm run lint`; `TZ=Europe/Rome npx vitest run` and
  `TZ=UTC npx vitest run`; `npx playwright test e2e/allocation.consulente.spec.ts e2e/assets.compravendita.spec.ts`
  with the old assertions green; `perf:budget` green.
- **B — Cambio di contesto**: `npx vitest run __tests__/choiceList.test.tsx` reports the `dom` project, and
  `npx vitest run __tests__/reactCompilerCoverage.test.ts` the `node` one.
- **C — Comportamento nuovo**: the new and extended suites of § 6 and the three specs, each falsified once by its
  mutation. Screenshots with emulators + `dev:emulator`, at 390, 768, 1024×768 and 1440: step 1, step 2 mid-slide
  (a scratchpad Playwright script, a 100 ms wait after «Avanti»), the run with the strategy active (the scratchpad
  route DELAYS each stage's request before answering it), the report from a planted document; never «Avvia la
  ricerca» against the real route.
- **D — Sotto la UI**: none: no route and no server code change.
- **E — Casi negativi**: the failed stage and «Riprova» of the faked-run test; the reduced-motion describes; without
  the key, «Avvia la ricerca» reads «Servizio AI non configurato» (shown by the 1440 screenshot of a `dev:emulator`
  started without `ANTHROPIC_API_KEY`).
- **F — Giro guidato**, at the owner's «pronto»: on the PR's preview, on a phone and at 1440, the owner walks the eight
  screens and opens the report of their LAST real document (no new run): the rail, the slide, the accent, the
  cascade, the count-up; their «ok» or their wording.
- **G — Ripristino**: the scratchpad scripts and screenshots deleted; the report spec has put back
  `allocationAdvice/test-user-1`; `SESSION_NOTES.md` written into its destinations and deleted, never committed.

## 8. Putting it into service

Branch `feat/consulente-scena` off `develop`; ONE commit after the owner's OK on the summary of the diff,
`feat(consulente): the path as a scene — rail, transitions, ChoiceList, the run's durations, the report's accent; the
RTL harness`; PR to `develop`, its preview opened by the owner for phase F. No flag.

## 9. Documentation

- **`doc/guide/consulente.md`**:
  - § Files, «Page»: «`ConsulenteRun.tsx` (the stages via SSE)» → «`ConsulenteRun.tsx` (the run's screen and
    `StageRows`, which the report's running view shares)»; a new bullet «**Primitives**: `components/ui/choice-list.tsx`
    (`ChoiceList`, every choice of the path and of the Compravendita), `components/ui/path-rail.tsx` (`PathRail`: the
    path's eight ticks, the run's four segments), `Tile`'s `generated` and the classes of `lib/constants/aiAccent.ts`,
    `sceneVariants` in `lib/utils/motionVariants.ts`.»
  - § Files, «Suites to run» (:29-33): add `motionVariants` and the Testing Library suites `choiceList`, `pathRail`,
    `tile`, `consulenteRun`, `useConsulenteRun`; «**Browser** `e2e/allocation.consulente.spec.ts` (the eight screens on
    the base fixture, NEVER the run: a test does not open a control that spends)» → «**Browser**
    `e2e/allocation.consulente.spec.ts` (the eight screens on the base fixture, and the run on a route faked with
    `page.route`: a test never spends), `allocation.consulente.mobile.spec.ts` (390: the strip, 44px, the overflow,
    reduced motion), `allocation.consulente.report.spec.ts` (planted documents: the accent, the cascade, the
    count-up)».
  - § The path, a new bullet after the first: «**The path is a scene**: `PathRail` draws the eight steps — a strip
    above the card below `desktop:`, a 160px column at 1440 with each step's name in 11px (a `sr-only` name on the
    strip), one `aria-current="step"`, ticks that are not buttons. The headline and the body slide 24px in the
    direction of travel (`sceneVariants`: 0.25 s in, 0.18 s out; a 0.15 s fade under reduced motion) inside
    `AnimatePresence mode="wait" initial={false}`; the eyebrow and the footer stay; after a change the headline takes
    the focus, unless the reader already moved it, and on a mount nothing moves. The direction is state set with the
    dispatch, never a ref (the React Compiler would skip the Wizard). Every choice is a `ChoiceList` row.»
  - § The path, :55-56: the sentence on «Avvia la ricerca» gains «; it glows on hover and focus only
    (`AI_CONTROL_ACCENT_CLASS`, DESIGN.md → The AI-Accent Rule)».
  - § The run, a new bullet after the first: «**The run says how long a stage usually takes**: each row of
    `StageRows` prints `STAGE_COPY[stage].detail` and «di solito ~N min» (`STAGE_TYPICAL_MINUTES`: strategy 2,
    instruments 2, review 1, nothing for the context — about five minutes in all at effort `medium`, 2026-10-23); the
    active row adds the elapsed time («m:ss», `aria-hidden`, from `stageStartedAt`, stamped by `useConsulenteRun` at
    every `stage` event) and the accent on its left border; a failed run marks the stages before `resumeFrom` done and
    that one failed (`runStageStates`). `PathRail` in run mode fills one segment per stage when it becomes active:
    stage status, never a percentage.»
  - § The report and «Applica», «**The tiles**» (:138-141): the list gains «Il report (markdown) or, without one, La
    strategia, Chiedi una modifica, Applica», and the bullet ends «**Every tile the model wrote carries `generated`**
    — the 1px `--ai-accent` border, the accented eyebrow, the glow on hover and focus — and the two action tiles
    («Applica», «Chiedi una modifica») never do; «Le fasi» of the running view does. The column cascades once per JS
    session (`consulenteReportEntrance`, its own flag; never under reduced motion), and the proposed percentages count
    up with it (620 ms).»
  - § Composizione mobile (:162-166): «one column at 720px, one card per screen, buttons at 44px below `desktop:`; no
    strip, no closed rows» → «one column at 720px (900px at 1440, the rail's 160px column beside the card), one card per
    screen, buttons at 44px below `desktop:`; no `VerdictStrip` — the rail's ticks above the card are not one: the
    page is still not a composed page —, no closed rows».
  - § Per-page blind spots: the bullet «The E2E spec opens over a finished report» ends «`allocation.consulente.report.spec.ts`
    plants its documents on that account and puts back the one it found, or deletes its own when there was none.»;
    two new bullets «**The ticks are not buttons**: the path is linear (`describeStepBlock` holds «Avanti»); the
    Summary's rows are the only jumps.» and «**The elapsed time is `aria-hidden`**, and the report's running view has
    none: the headline is the one live region, and a reload does not know when the stage began.»; the bullet «**No
    E2E spec of the run**, by the rule of the tests that do not spend; …» (:204-205) → «**The run in the browser runs on
    a faked route**: `e2e/allocation.consulente.spec.ts` answers `/api/allocation-advice/run` with `page.route`
    (`doc/guide/e2e-emulatori.md` § Browser-Driven E2E) — the order of the requests, the rows, a failed stage and
    «Riprova»; the real run was made on the mirror on 2026-10-20 with the owner's key (the outcomes in that session's
    SESSION_NOTES and in the commit).»
- **`doc/guide/compravendita.md`** § Files (:15): «`fields.tsx` (`ChoiceRows`, `NumberField`, …» → «`fields.tsx`
  (`NumberField`, `DateField`, `AccountField`, `CategoryField` — …); the choice rows are `ChoiceList`
  (`components/ui/choice-list.tsx`, shared with the Consulente)».
- **`doc/guide/e2e-emulatori.md`** § Browser-Driven E2E, a new bullet after «A spec that needs a server-computed FLAG
  forces it on the RESPONSE»: «**A control that calls a model is pressed only on a FAKED route** (decision 39 of the
  AI series): `npm run dev:e2e` is `next dev`, which loads `.env.local`, so the owner's real `ANTHROPIC_API_KEY`
  reaches the server on :3100 and enables the control (the Consulente's `configured`) — the key makes it pressable,
  never what answers it. The spec installs `page.route('**/api/allocation-advice/run', …)` BEFORE the click and
  answers each request by its `stage` with an SSE body (`data: {json}\n\n`: the `stage` events, then `done` or
  `error`); a request it must hold to read a state is answered after the assertion. No dummy key in `package.json`, no
  real request from a spec. Worked example: `e2e/allocation.consulente.spec.ts` › «runs the three stages on a faked
  route, a failed stage retried from itself».»
- **`doc/guide/dipendenze.md`** § Registro, its «Moves» table: one row —
  the date · `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event` · new
  devDependencies at their exact versions · no advisory (the component-test harness, decision 21) · the PR.
- **`AGENTS.md`** § Allocazione › Consulente, :455 rewritten in place (net 0 lines): «- A probe never SPENDS on the
  Consulente (2026-11-01): the E2E specs answer `/api/allocation-advice/run` with `page.route` before pressing «Avvia
  la ricerca» — the `.env.local` key only enables it on :3100 (doc/guide/e2e-emulatori.md § Browser-Driven E2E); the
  real run is made once, on the mirror.»
- **`CLAUDE.md`**: § Key Files, «Shared primitives / utils»: `components/ui/{…,lazy-component}.tsx` →
  `components/ui/{…,lazy-component,choice-list,path-rail}.tsx`; § Testing, the Vitest bullet gains «; components and
  hooks as `__tests__/<name>.test.tsx` with Testing Library under jsdom (the `dom` project of `vitest.config.ts`)».
- **`DESIGN.md`** § 5 «AI Surfaces»: one «Implemented on <date> (PR #…)» line under The Path-Scene Rule
  (`components/ui/path-rail.tsx`, `sceneVariants` in `lib/utils/motionVariants.ts`, `ConsulenteWizard.tsx`,
  `ConsulenteRun.tsx`) and one under The AI-Accent Rule (`Tile`'s `generated`, `lib/constants/aiAccent.ts`, the
  Consulente's report and run, Rendimenti's «Analizza con AI»); in The Question-Card Rule the ONE word `ChoiceRows`
  becomes `ChoiceList` (the rule was written on 2026-11-01, when only `ChoiceRows` existed); nothing
  else rewritten, nothing added to the frontmatter.
- **`Draft Release Temp.md`**: the entry «Allocazione — Consulente» (one entry per surface, rewritten to its final
  state, as the file's header says) gains, before its last sentence («Reached from the «Consulente» button…»),
  decision 52's sentence: «The Consulente's path now moves screen to screen: a guide shows where you are, and the run
  says how long each stage usually takes.»

## 10. Declared out of scope

- The interview's screens, `interview` passed to `PathRail`, the «Il colloquio» tile and «Avvia il colloquio»: AI-04.
- `GoalProposalCard`, the Assistente's cards and the whole Assistente page under «AI Surfaces»: AI-05 (decision 26).
- The Allocazione page's «Consulente» button and tile: unchanged (decision 14).
- `ExchangeField`: it stays a `Select` with «Altra…» (`doc/guide/consulente.md` § Per-page blind spots, the
  exchange).
- An accent per theme: one `--ai-accent` per mode (decision 36).
- A tablet spec, and a Consulente entry in `perf/budget.json` or `perf/mobile-budget.json`: none (the lead's
  resolution on the tablet; a dynamic route; not a composed page).
- `@testing-library/jest-dom`: not added (the assertions read the DOM).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, doc/guide/motion.md, AGENTS.md (§ React Compiler and the hooks rules; § Accessibility; § Tailwind Breakpoints;
§ Browser-Driven E2E; § Commands), DESIGN.md § 1 e § 5 «AI Surfaces» (The AI-Accent Rule, The Path-Scene Rule),
doc/guide/consulente.md, doc/guide/compravendita.md, doc/guide/e2e-emulatori.md (§ Browser-Driven E2E),
doc/guide/dipendenze.md (§ How an upgrade is done, § Registro), doc/ai/README.md § 3, § 6, § 7, § 8 e
doc/ai/AI-03-redesign-percorso-corsa-report.md. Per prima cosa `node -v`: se non dice 24, fermati (decisione 33).
Fermati e dimmelo anche se in README § 6 AI-02 non risulta ritirata, o se AI-03 vi è segnata «da rileggere»
(decisione 37: prima la rilettura mirata delle parti riscritte). Implementa AI-03 così com'è scritta, in
quest'ordine: l'harness (le quattro devDependencies a versione esatta, i due progetti di vitest.config.ts,
__tests__/domSetup.ts, il gate di doc/guide/dipendenze.md § How an upgrade is done una volta, la riga nel § Registro); `ChoiceList` con il
contratto della § 4 (identico: lo usano AI-04, AI-05, AI-06) e le due copie di `ChoiceRows` eliminate; `Tile` con
`generated` e lib/constants/aiAccent.ts; i token in globals.css e «Analizza con AI»; `PathRail` e la scena con le
varianti di motionVariants.ts; la corsa con `stageStartedAt`, i minuti tipici, `StageRows` e gli stati del
fallimento; il report con l'accento su ogni tessera tranne «Applica» e «Chiedi una modifica», la cascata una volta per
sessione e il conteggio. Nessuna domanda del percorso cambia. I test dei componenti sono .test.tsx con Testing
Library; Vitest in entrambe le zone; le tre spec Playwright (desktop, mobile, report): «Avvia la ricerca» e «Riprova»
si premono SOLO sulla rotta finta via page.route, mai una richiesta vera. Collaudo: § 7 della spec. Un branch, un
commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Fable 5.1**, effort **xhigh** (motion, accessibility and compiler coverage across five components, plus a new
test harness). Estimated size: one long session, ~6 h; ~160 lines `choice-list.tsx`, ~120 `path-rail.tsx`, ~120 of
diff in the Wizard, ~90 in the run, ~70 in the report, ~25 in `tile.tsx`, ~450 of Vitest, three E2E specs and a
helper (~350).
