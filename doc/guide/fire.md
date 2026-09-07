# FIRE, What If and Goals

> **When to open this guide** — you are touching the FIRE page as a whole (`components/fire-simulations/*`, `lib/services/{fireService,whatIfService,monteCarloService,goalService}.ts`, `lib/utils/{pensionUnlock,monteCarloParams,goalTrajectory,goalMath}.ts`) or its first tab, the Calcolatore (`components/fire-simulations/FireCalculatorTab.tsx`, `components/fire-simulations/tiles/*`, `lib/utils/{fireSummary,fireNarrative}.ts`). **The page-wide rules live here**, in § FIRE, What If and Goals — every citation in the repo points at that section — and the Calcolatore section follows, because the first tab shares the most with them. The other four tabs have a guide apiece, each opening with the same page-wide rules and closing with its own blind spots: `doc/guide/fire-coast.md` (Coast FIRE, `coastFireView.ts`), `doc/guide/fire-what-if.md` (What If, `whatIfSummary`/`whatIfNarrative`), `doc/guide/fire-monte-carlo.md` (Monte Carlo, `monteCarloSummary`/`monteCarloNarrative`), `doc/guide/fire-obiettivi.md` (Obiettivi, `goalsSummary`/`goalsNarrative`). In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals, which names the five files). Modules and files: `CLAUDE.md` → *Key Files* → the FIRE entries for this area. Fixture and E2E specs: `scripts/seedCoastFireE2E.mts`, `e2e/fire*.spec.ts` and `e2e/coast*.spec.ts` (`coast.mobile.spec.ts` and `fire.mobile.spec.ts` measure `main`'s overflow); the pension-lock emulator exercise script relies on `pensionUnlock` being override-only when there are no settings.

## FIRE, What If and Goals

- **What If = perturbation + diff, no new projection math**: every v1 life event is a year-0 perturbation, then
  `fireService` is re-run on baseline vs adjusted and diffed. Do NOT add timed mid-projection cash events. **Keep the
  pure layer category-agnostic** — the selection of lost income sources and its sum live in the UI
  (`components/fire-simulations/whatif/incomeSelection.ts`). **The bridge rides on the baseline** (`WhatIfBaseline.pensionBridge`,
  2026-08-25): with the lock on, `calculateWhatIfImpact` reads the bridge FIRE number (`calculateFireBridgeNumber`) and passes
  the bridge to BOTH walks, so the «prima» side agrees with the Calcolatore's year; without it the walk is byte-identical.
- **Pension unlock is ONE rule in ONE place** (`lib/utils/pensionUnlock.ts`, explicit `now`): per-fund `unlockDate`
  override > RITA rule from `userAge` (INPS age − 5, or − 10 with `pensionRitaLongUnemployment`) > `null` = NOT locked
  (and the UI must say why). `pensionFire.calculatePensionLockedValue` is a thin wrapper — with no settings it is
  override-only, the behaviour the emulator exercise script relies on.
- **Coast FIRE is the same IA on a different question** — «posso smettere di versare?» — answered by the shortfall
  against `coastFireNumberToday`, with an inflow timeline that names the pension unlock and each state pension.
- **The bridge model reuses the Coast walk, never a second formula.** `buildCoastFIRERetirementNeeds` takes
  `capitalInflows` (amounts AT the inflow year) and extends its horizon to `max(bridgeYears, max inflow year)` —
  without the extension the FIRE-tab case (no state pensions → bridgeYears 0) silently drops the inflow. The
  "reduction = A/(1+r)^y" invariant holds INSIDE the pension bridge; beyond it the extra discounted years change the
  baseline too — that is the model, not a bug. Empty inflows leave the walk byte-identical.
- **`respectPensionLockInFire` governs the WHOLE FIRE page** (Calcolatore, Coast, What If via its baseline, Monte
  Carlo): each tab subtracts the locked total from its starting capital AND passes the inflows — doing only the
  subtraction reintroduces the "sottratto per sempre" bug the bridge model replaced. Monte Carlo adds inflows at
  TODAY's value (no deterministic fund growth inside a stochastic run, declared in the form's read-only row), order
  inflow → return → withdrawal. With growth = discount rate the bridge number is insensitive to the unlock year until
  the floor binds, which is why the FIRE tab aggregates multi-fund unlocks on the LATEST year.
- **Config-first collapse: decide ONCE after the form has settled.** A "collapsed if already configured" panel cannot key
  on the transient `hasUnsavedChanges` — use a `useRef` seeded-flag set when `!isLoadingSettings && !hasUnsavedChanges`,
  and gate the temp-sync effect on `!isLoadingSettings` (not `if (settings)`).
- **The Ventaglio engine mirrors the deterministic walk BY CONSTRUCTION** (`runAccumulationSimulation`): per year
  inflow → random return → savings (stopped once the path retires), moving target = inflated expenses ÷ WR. At zero
  volatility every path collapses float-for-float onto `calculateFIREProjection`'s base scenario — the coherence test
  pins that identity WITHOUT inflows, because the deterministic bridge grows the pension compartment while a Monte
  Carlo run injects inflows at today's value. Do not "fix" the test to include them: the divergence IS the model.
- **The allocation→4-MC-classes normalization is ONE function** (`deriveMonteCarloAllocation`): MonteCarloTab's
  auto-fill and the FIRE Ventaglio consume it and must never re-inline it. `null` means "keep the previous allocation",
  and the rounding residual lands on the smallest class, even a zero-value one (pinned by tests).
- **Memoize every input feeding the fan's `useMemo`** — a `pensionLockState` (and therefore `fanInputs`) rebuilt per
  render re-runs 1000 simulations on every keystroke. The fan is armed only on first opening its view.
- **The Coast tab computes nothing**: `lib/utils/coastFireView.ts` chooses which of `fireService`'s own fields to show
  and in which words (the verdict included — see `doc/guide/fire-coast.md § FIRE › Coast FIRE — a verdict over tiles`); `CoastFireTab.tsx`
  orchestrates, `components/fire-simulations/coast/tiles/*`, `CoastIpotesi` and `CoastDettaglio` render,
  `useCoastFireSettingsDraft` owns the form. A figure that cannot be pointed at inside a `CoastFIREScenarioMetrics` does
  not belong on that tab. **The Afflussi tile is the visual explanation of the discount**, not a second model: state
  pensions come from the scenario's `pensionBreakdown`, the fund from `resolvePensionLockState`'s inflows AT TODAY'S
  VALUE — growing it there double-counts what the walk already does.
- **Goal trajectory is annuity math in a tested pure layer** (`goalTrajectory.ts`), never a `useMemo` in the card; the
  verdict compares the *projected value at the deadline* against the target with a 1% tolerance, not contribution ≥
  requiredMonthly (float flapping). Coast FIRE's nested pension rows must be serialized without `undefined` fields.
- **The goal math the SERVER also needs lives in `lib/utils/goalMath.ts`, re-exported by `goalService.ts`** — that
  service imports `doc/getDoc/setDoc` + `db` at top level, so server code can never import it. `goalMath` imports
  `calculateAssetValue` DIRECTLY (the second sanctioned route) rather than taking an injected `valueOf`: identical
  signatures are what let the re-export be literal and leave every client call site untouched.
- **`serializeGoalForFirestore` IS the persistence allowlist for `InvestmentGoal`**, the single copy used by
  `saveGoalData` (client) and `POST /api/goals` (server). A new optional field on the type is silently dropped on save
  until it is added there.
- **The goal document is rewritten WHOLE, never patched.** So the Admin append is a transaction (the FIRE page writes
  the same doc), the goals already stored and `assignments` pass through **verbatim**, and the colour is picked INSIDE
  the transaction (`pickNextGoalColor`), or two goals created concurrently come out the same hue.

## FIRE › Calcolatore — a verdict over tiles (`components/fire-simulations/FireCalculatorTab.tsx`, `components/fire-simulations/tiles/*`, `lib/utils/{fireSummary,fireNarrative}.ts`)

- The tab owns three states — `view` (Scenari | Ventaglio, the Traguardo tile's aside), the pension-lock switch
  (persisted on change) and the Parametri form (a preview until «Salva») — and computes nothing: numbers come from
  `fireSummary.ts` over the engines the tab already ran (`calculateFIREProjection`, `calculateFIREMetrics` +
  `calculateFireBridgeNumber`, `resolvePensionLockState`, `runAccumulationSimulation`), words from `fireNarrative.ts`.
- **ONE expense figure for the number, the verdict and the chart**: `getAnnualCashflowData` (the last full year, else
  the running year annualized — the Base di calcolo aside says which). `getFIREData`'s own `metrics.annualExpenses`
  reads the last full year ONLY and is not used for the number: on an account with no last-year rows it is 0, and the
  page called the number «non calcolabile» beside a projection it kept drawing (caught by Playwright on the base
  fixture). `getFIREData` still feeds the runway and the cashflow history.
- **The lock switch saves on change** (optimistic `setRespectPensionLockIn`, reverted on error, disabled while
  pending and in demo with the reason in visible copy) and is NOT part of `hasUnsavedChanges`; the form keeps the SWR,
  the residence, the INPS age and the RITA hypothesis behind an explicit save. The config-first collapse (`useRef`
  seeded, never keyed on the transient `hasUnsavedChanges`) is unchanged; the effects that seed it defer their
  `setState` with `setTimeout(…, 0)`.
- **The fan's verdict is pure** (`resolveFanVerdict`: the deterministic base year when it lies inside the simulated
  horizon, else the horizon and `onHorizon` says so), read by the Traguardo footer and the chart's `aria-label`;
  `FireFanChart` renders no prose. Both charts take `height="100%"` inside `relative flex-1 min-h-[240px]` with an
  `absolute inset-0` box (the EvoluzioneTile technique): a Recharts `ResponsiveContainer` with a percentage height
  needs a definite parent, and the prop type is a template literal (`number | \`${number}%\``), not `string`.
- **Every FIRE tab reads and writes with `ownerId`, never `user.uid`** (fixed 2026-08-25 on all four tabs: Calcolatore,
  Coast, What If, Monte Carlo — Obiettivi already did). The React Query keys were namespaced by `ownerId` while the
  functions took `user!.uid`, so a guest on a shared account saw their OWN (empty) FIRE data and saved settings on
  their own doc. `enabled: !!user && !!ownerId` gates every query; `ownerId!` is safe past that gate.
- **`PageContainer` (1920px) on every FIRE tab** (Obiettivi joined on 2026-08-26, the last of the five; the `width` prop went on 2026-09-06). Every
  propagated tab loads as `TileGridSkeleton` with its own cells (`FireCalculatorSkeleton`, `GoalsSkeleton`,
  `WhatIfAnalysisSkeleton` and `MonteCarloSkeleton` are gone).
- **The passive income at the FIRE year is nominal and never stands alone** in the verdict: beside today's expenses
  with the inflation named («2300 € al mese di oggi, 2667 € del 2032 con l'inflazione al 2,5%»), or one figure when
  inflation is 0. A projection carries no sign colour; the only signed figure on the page is the current withdrawal
  rate over the SWR, in the Reddito passivo tile.
- **The form re-seeds from the SAVED values only when they change** (`lastSyncedFormRef`): the lock switch saves on
  its own and refetches the doc, and a refetch that changed nothing the form edits must not wipe a typed SWR. The
  `fireData` query keys on `currentNetWorth`, so it uses `placeholderData: keepPreviousData` — without it a lock
  flip or the residence switch dropped the whole tab to the skeleton mid-interaction. Every write restates
  `respectPensionLockInFire` from the local state, because the cached `settings` it spreads can lag a lock save.
- **A chart slot is not a text colour, here either**: the scenario labels of Parametri (and the Scenari rows) are
  muted text beside an 8px swatch in the slot. **No sign token on a projected figure.** The year-by-year table was
  dropped on request (2026-08-25): the Scenari chart and tile already carry what it listed.
- Playwright locates the tiles by `role=region` + `aria-label` («Traguardo FIRE», «Base di calcolo del FIRE», «Reddito
  passivo sostenibile», «Scenari di mercato»), the verdict by «Verdetto sul FIRE», the view switch by `role=group`
  «Vista della proiezione» (`aria-pressed` buttons), the switch by its `aria-label`, the two disclosure triggers by
  their VISIBLE text (`/^Parametri/`, `/^Dettaglio/` — no `aria-label`, so «Anteprima non salvata» is part of the
  name); the hero is `p:has-text("Numero FIRE") + span`, never «the first mono span» (the reading comes first). The
  390 guard opens Parametri, Dettaglio and the Ventaglio before measuring `main`.

## Per-page blind spots

- **FIRE › Calcolatore**: «FIRE nel {anno}» is the BASE scenario of a deterministic walk on the last full cashflow year (or the running year annualized, said in Base di calcolo) — changed expenses read stale until the year closes; a target reached «today» prints no passive-income clause; the Ventaglio runs only while open, its probability lives in the Traguardo footer; `getFIREData` still runs for runway and history but its `metrics` are ignored; the fan is unavailable without an allocation in the four MC classes; the pension-lock switch is optimistic (a failed save reverts with a toast), disabled in demo; Parametri reopens on every unsaved edit.
- The blind spots of the other four tabs live at the end of their own guides: `doc/guide/fire-coast.md`, `doc/guide/fire-what-if.md`, `doc/guide/fire-monte-carlo.md`, `doc/guide/fire-obiettivi.md`.
