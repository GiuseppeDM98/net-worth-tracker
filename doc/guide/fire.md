# FIRE, What If and Goals

> **When to open this guide** — you are touching `components/fire-simulations/*`, `components/{goals,monte-carlo}/*`, `lib/services/{fireService,whatIfService,monteCarloService,goalService}.ts`, or the pure layer in `lib/utils/{fireSummary,fireNarrative,coastFireView,whatIfSummary,whatIfNarrative,monteCarloSummary,monteCarloNarrative,goalsSummary,goalsNarrative,goalTrajectory,goalMath,pensionUnlock,monteCarloParams}.ts`. In `AGENTS.md` only the stub with the essentials remains; the full rule is here. Modules and files: `CLAUDE.md` → *Key Files* → the FIRE entries for this area. Fixture and E2E specs: `scripts/seedCoastFireE2E.mts`, `e2e/fire*.spec.ts` and `e2e/coast*.spec.ts` (`coast.mobile.spec.ts` and `fire.mobile.spec.ts` measure `main`'s overflow); the pension-lock emulator exercise script relies on `pensionUnlock` being override-only when there are no settings.

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
  and in which words (the verdict included — see § FIRE › Coast FIRE — a verdict over tiles); `CoastFireTab.tsx`
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
- **`PageContainer width="wide"` on every FIRE tab** (Obiettivi joined on 2026-08-26, the last of the five). Every
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

## FIRE › Coast FIRE — a verdict over tiles (`components/fire-simulations/CoastFireTab.tsx`, `components/fire-simulations/coast/*`, `lib/utils/coastFireView.ts`)

- The tab answers «posso smettere di versare?» before any number and computes nothing: `coastFireView.ts` holds BOTH
  the numbers (`summarizeCoastTarget`, `summarizeCoastScenarios`, `summarizeCoastPensions`, `buildCoastInflowEvents`,
  `resolveCoastBridgeYears`) and the words (`buildCoastVerdict`, the `describe*` readings) — one module on purpose, the
  one exception to the `*Summary`/`*Narrative` pair, because this tab CHOOSES what to show of `fireService` and one
  file is where that choice is tested. The only arithmetic in it is a ratio (liquid progress) and a difference (surplus);
  the parity test pins that every euro printed is one of the projection's own numbers.
- **The target line of the projection steps WITH the fund** (`fireService.calculateCoastFIREProjection`, 2026-08-25):
  `retirementCapitalRequired` is already net of the fund (the walk subtracts it valued at retirement —
  `amountToday × (1+r)^yearsToRetirement`, whether it unlocks before or after the target age), so `fireNumberTarget`
  is that net figure until the unlock and the gross one (net + the unlocked funds grown to retirement) from it. Before
  the fix the flat net line beside a stepped series showed the portfolio crossing the target with 24% of the Coast
  number still missing. A fund unlocking after the target age is never on the plot and never added. Pinned by tests.
- **The verdict's two capital figures are net of the fund** (`futureValueAtRetirementWithoutNewContributions` grows the
  FREE capital; `retirementCapitalRequired` is net of the fund's re-entry) and the lock sentence says so — «I 31.400 € nel
  fondo pensione sono esclusi da queste cifre perché restano bloccati fino al 2045; il calcolo li conta da quell'anno
  in poi». The Traguardo footer names the gross line («472.977 € con il fondo
  pensione dentro») only when the unlock is on the plot; an unlock past the target age is said as such.
- The lock is `summarizeLock(pensionLockState, { currentYear, ritaUnlockAge })` — the same `FireLock` the Calcolatore
  reads — with `ritaUnlockAge` from the SAVED settings (`resolveRitaUnlockAge(settings)`): Coast has no RITA form of its
  own. The page has NO switch: the pension lock is the Calcolatore's Base di calcolo control, the Ipotesi description
  names its state («fondo pensione bloccato fino al 2048») and the Dettaglio explainer says where it lives.
- **The pension clause lists EVERY pension with its start year** («dal 2052 la Pensione estera, dal 2055 la Pensione
  INPS e dal 2061 la pensione di Marco coprono insieme …»), at `totalNetAnnualPensionAtSteadyState / 12`; a label
  that starts with «Pension…» takes the article («la Pensione INPS»), any other label — a household names rows after
  the person — reads «la pensione di Giuseppe». Start years come from the decorrenza, else
  `currentYear + ceil(yearsUntilStart)` — the same rule as the Afflussi events. No pension → no clause, never
  «nessuna pensione».
- The Ipotesi disclosure has ONE «Salva ipotesi» (in the Profilo tile) for its four tiles: the form is one document and
  `useCoastFireSettingsDraft` has one mutation. Config-first via the `useRef` seeded flag set INSIDE a `setTimeout(0)`
  (StrictMode clears the first timer), open only while no age is saved, reopening on an unsaved edit or an
  `incomplete` pension state; never auto-closed. The pension issues render as lines under the tile's reading (warning
  tone for the incomplete ones), not as a banner.
- The «Impatto delle pensioni» table is `hidden desktop:block`; below `desktop:` the same rows are a flat list — five
  columns at 350px pushed the tile past the phone's edge (caught by `coast.mobile.spec.ts`, which measures `main`'s
  offenders like `fire.mobile.spec.ts`).
- Playwright locates the tiles by `role=region` + `aria-label` («Traguardo Coast FIRE», «Afflussi già considerati»,
  «Scenari Coast FIRE»), the verdict by «Verdetto sul Coast FIRE», the disclosures by their VISIBLE text (`/^Ipotesi/`,
  `/^Dettaglio/` — the Ipotesi trigger carries the basis line, so it can be asserted closed), the hero as
  `p:has-text("numero Coast FIRE") + span`, the scenario list by `role=list` «Numero Coast FIRE per scenario». The
  fixture fixes expenses but not the clock: structure and format only (AGENTS.md § Browser-Driven E2E).

## FIRE › What If — a verdict over tiles (`components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*`, `lib/utils/{whatIfSummary,whatIfNarrative}.ts`)

- The tab answers «cosa cambia se…?» and computes nothing: `calculateWhatIfImpact` (service) perturbs and diffs, `whatIfSummary.ts`
  turns the impact into the event as stated, the before/after pairs, the merged series, the divergence and the sensitivity reading,
  `whatIfNarrative.ts` puts them into words. The service now RETURNS the two base-scenario walks it runs (`projections`), so the
  chart draws the series the years were read from — never a third walk in a component. The job-loss decomposition (retained income
  covers the expenses first, the portfolio pays the uncovered part) is `decomposeJobLossHit`, out of the component.
- **The headline and the tone come from the delta in years** (`timelineCase`: keeps · loses · gains · neverBoth · leaves · returns ·
  same · moves), shared by the verdict and the Prima e dopo reading; a `yearsToFIRE` of 0 means reached, null means beyond the
  50-year horizon (`WHAT_IF_HORIZON_YEARS`, the Calcolatore's). **Only the deltas carry a sign** (`signedAmount`), by the direction
  that is good for the row (`buildDeltaRows`: net worth and income higherBetter, FIRE number, Coast number and gap lowerBetter);
  a change under half a unit is «invariato», never «+0 €». **An empty perturbation** (`WhatIfEvent.isEmpty`: no months or no lost
  income, a lump sum of 0, both cashflow deltas 0) gets «Nessun evento da simulare.» with today's plan, not a zero delta.
- **The event clause is household-agnostic**: months, the lost amount and its share of expenses + savings (`lostShareOfIncomePct`,
  null when the household earns nothing, and the clause drops). The names of the sources live only in the Evento tile's picker.
- **The Prima e dopo tile has no hero on purpose** (the canvas's proposal): the year is the verdict's headline and the Delta's first
  row. Its one figure is the divergence — both capitals at the FIRE year of the plan of today (`summarizeDivergence`; the
  after-event year when today's never gets there; null when neither does or the target is already reached), read from the merged
  series (`buildWhatIfComparisonSeries`: the union of the years, null where a walk stops — a walk ends five years after its last
  scenario reaches FIRE, so a purchase lengthens the after side and `connectNulls={false}` leaves the gap). The plan of today is
  `--muted-foreground` (a baseline is neutral), the plan after the event `--chart-1`; the before target is drawn only when the
  event moves the FIRE number (`targetsDiffer`). Reference lines mark the two FIRE years, none for a side reached today.
- **The Sensibilità matrix runs on the plan of TODAY**, centred on the actual or the typed reference expenses, never on the event —
  the aside says «piano di oggi», the footer says why. Cells: the baseline outlined (`border-foreground`), better `bg-positive/15`,
  worse `bg-destructive/15` — the sign tokens, not chart slots. Below `desktop:` it is one block per expense level with the savings
  cells in two columns (a cardified matrix needs its own labels). `summarizeSensitivity` reads the −10% row at the baseline column
  and the column right after the baseline (`+25%`, or `€5k` on the zero-savings fallback, whose label starts without `+`).
- **Every Delta row is `flex-wrap`**: «Raggiunto → Raggiunto» in a 3-column tile drops under the label, right-aligned, instead of
  splitting «Numero Coast oggi» over three lines (the Per classe row's rule).
- Playwright locates the tiles by `role=region` + `aria-label` («Prima e dopo l'evento», «Delta dell'evento», «Evento simulato»,
  «Sensibilità degli anni al FIRE»), the verdict by «Verdetto sul What If» (its sentence is the `p` under the heading — the region's
  text starts with the headline), the event switch by `role=group` «Tipo di evento» (`aria-pressed` buttons), the rows by the lists
  «Prima e dopo per il FIRE» / «…per il Coast FIRE», the picker by «Fonti di reddito», the matrix by its `table` (1440) or the
  list «Anni al FIRE per livello di spesa» (390). On the base account the target is REACHED (small expenses), so a spec asserts the
  headline against the set of live phrasings and the deltas against a typed amount, never a year.

## FIRE › Monte Carlo — a verdict over tiles (`components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*`, `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts`)

- The tab answers «quanto è probabile?» and computes nothing: `runMonteCarloSimulation` runs, `monteCarloSummary.ts` reads the run (the base
  scenario's horizon dated in years and in age, the first year the 10th percentile touches zero, the final percentiles of ALL simulations, the
  histogram with the median's bin, the three scenarios, the Dettaglio's overlay and percentile rows, the plan as typed), `monteCarloNarrative.ts`
  puts it into words. **The median the page reads is the last percentile row's p50** — `results.medianFinalValue` is the median of the SURVIVORS
  only and overstates a plan that fails often; it stays in the payload, no surface prints it.
- **ONE run = the three scenarios** (Orso · Base · Toro, `buildParamsFromScenario` over the shared plan): the verdict, Probabilità and
  Distribuzione read Base, the Scenari tile reads all three. The «Simulazione singola | Confronto scenari» toggle went with the mode it switched;
  the single form's market fields ARE the Base scenario's, and the plan's `params` carry `getDefaultMarketParameters()` only as a placeholder
  every run overrides.
- **Auto-run once, explicit afterwards** (The Stale-Run Rule): the seeded plan runs on its own (`didAutoRunRef`, inside a `setTimeout(0)` —
  react-hooks/set-state-in-effect); every later run is «Esegui». A run keeps the inputs it was made with (`MonteCarloRunState.inputs`) and
  `haveRunInputsChanged` compares the PLAN fields, the scenarios and the inflows — never the single form's market fields — so the Parametri footer
  says «I risultati sopra usano i parametri dell'ultima esecuzione» in the warning tone while every tile keeps the last run. A 30.000-path run on
  every keystroke was one alternative; a silent re-run that changed the verdict under the reader's eyes was the other.
- **The form is strings, the run is numbers**: the tab owns `MonteCarloForm` (as FireParametri's form) and derives `MonteCarloParams` with
  `parseItalianNumber` (it-IT amounts, plain numbers, a hand-typed «12.5») and `formatInputAmount`; the «Totale / Liquido» shortcuts write the
  string. The seed happens ONCE (`didSeedRef`) from the portfolio net of the locked funds, `plannedAnnualExpenses` and
  `deriveMonteCarloAllocation` (the ONE normalizer, shared with the Ventaglio; 60/40 when the four classes hold nothing) — a refetch never
  clobbers a typed value. Until the seeded plan has run once the tab shows the `TileGridSkeleton`; a plan that cannot run shows the verdict
  («Monte Carlo non calcolabile.») over the Parametri tile alone.
- **The pension lock rides as inflows at today's value** (`resolvePensionLockState` → `capitalInflows`; order inflow → return → withdrawal in the
  service): the starting capital is net of the locked total, the read-only row under the amount field names each inflow, the fan draws a dashed
  muted guide at the unlock year when it is on the plot and the Probabilità footer names the step.
- **`createDistribution` caps the equal-width bins at the 95th percentile** (2026-08-26) and the last bin takes the tail to the maximum
  (`from`/`to` on every bin, the last one closed on `to`): bins stretched to a ten-times-the-median outlier left nine of ten empty on the first
  screenshot. The Distribuzione footer names both bounds; the bars are hand-written SVG (`FinalValueBars`, the In-tile Bars rule: labels outside
  the SVG, the median's bin outlined, hover reading under `(pointer: fine)`).
- **No figure on the page wears a sign token** — a probability is not a gain, a projected value not a loss; the headline's tone
  (`resolveSuccessTone`: ≥ 90 positive, 80–89 warning, below negative — the old hero's thresholds) is the one judgement, and the fan's dashed
  zero line is the one `--destructive` stroke (the capital exhausted is a fact with a sign). Scenario colours are ONE map, `SCENARIO_SLOT`
  (bear 4 · base 0 · bull 1, the Calcolatore's), read by the Scenari rows, the Parametri swatches, the overlay and its footer legend.
- **The elision before a percentage follows the Italian number name** (`startsWithVowel`): «nel 10,6%», «nell'11%», «nell'84,2%», «nel 18,2%» —
  a digit-based rule printed «nell'10,6%» on the first screenshot.
- Playwright locates the tiles by `role=region` + `aria-label` («Probabilità di successo», «Distribuzione dei valori finali», «Scenari a
  confronto», «Parametri della simulazione» — pass `exact: true`: the first is a prefix of the scenario list's name), the verdict by «Verdetto sul
  Monte Carlo», the hero as `p:has-text("Probabilità di successo") + span`, the scenario rows by the list «Probabilità di successo per scenario»,
  the fan by `[role="img"][aria-label*="Ventaglio del piano di prelievo"]` (the Calcolatore's is «Ventaglio Monte Carlo»), the inputs by their
  `#mc-*` ids, the disclosure by `/^Dettaglio/`. The figures are random draws: a spec asserts structure, format and the stale flag's round trip
  (edit → warning footer → Esegui → «Ultima esecuzione con questi parametri»), never a rate.

## FIRE › Obiettivi — a verdict over tiles (`components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/tiles/*`, `lib/utils/{goalsSummary,goalsNarrative}.ts`)

- The tab answers «sono in rotta?» and computes nothing: `computeGoalTrajectory` (per goal, ONE `now` per mount) and `calculateGoalProgress` run as
  before, `goalsSummary.ts` chooses what each tile shows (`summarizeGoals` in urgency order with the counts and the assigned share, `summarizeTrajectory`
  with the chart's series, `buildMilestones`, `summarizeDerivedAllocation` over `deriveTargetAllocationFromGoals`, `summarizeAssignments` closed by the
  free shares), `goalsNarrative.ts` puts it into words. The verdict per goal is the trajectory's own (projected value at the deadline against the target,
  1% tolerance); the headline judges the DATED goals only (`counts.dated`) — every one in time positive, some late warning, all late negative, nothing to
  judge neutral — and the sentence gives every goal its clause, the late ones with the EXTRA pace (`required − planned`, the whole pace when nothing is planned).
- **Dates are `{ year, month }`** (`goalDateFromIso` reads the ISO string, never a `Date`): a deadline typed as «2029-06-30» stays in June whatever
  timezone renders it. `monthsBetween` still ceils on 30.44-day months, so «giugno 2029» from 2026-08-26 is 35 months, not 34 — derive a test
  expectation from the function, never by hand (the first cut of the tests lost ten assertions to that and to Intl's ungrouped four-digit amounts, «1531 €»).
- **The selection is a row** (`selectedGoalId`, falling back to the most urgent, following a deletion, session-only); the Traiettoria's actions (Modifica,
  Elimina through `useArmedDelete`, the disarm announced by a `role="status"` span) sit in its aside — the Scheda's ghost buttons from `desktop:`, 44px
  targets below. In demo the aside says «non modificabile in demo» and the Assegnazioni footer «In demo le quote non si modificano».
- **The goal's hex is identity** (dot, track, milestone, projection, the Panoramica's ObiettivoTile); the classes of Allocazione derivata take
  `ASSET_CLASS_CHART_INDEX` through `useChartColors` — the deleted `AllocationComparisonBar` carried a map of its own. Its «assigned» bar aggregates
  every goal's quotas by euro (reached included) while the derived target excludes the reached goals: the footer says the reached do not weigh.
- **The free shares are the residual**: `summarizeAssignments` lists an instrument with more than 0,5% and 0,50 € free, sums `freeTotal` over EVERY
  instrument so the «Non assegnato» row adds up, and names an instrument assigned past 100% in the footer's warning tone (the amber card is gone). Orphaned
  quotas are skipped as `goalMath` does; the tab still runs `cleanOrphanedAssignments` before every write, and every write rewrites the document whole.
- **The Milestone never shows a deadline as an arrival**: a late goal keeps its projected month with «15 mesi dopo la scadenza di giugno 2029» under it, a goal
  the pace never reaches reads «mai, al ritmo attuale», an open goal is not listed. The old timeline fell back to the target date and called it a milestone.
- Playwright locates the tiles by `role=region` + `aria-label` («Obiettivi», «Milestone», «Allocazione derivata», «Assegnazioni» — pass `exact: true`,
  «Obiettivi» is a prefix of the list's name; the Traiettoria by `/^Traiettoria di /`), the verdict by «Verdetto sugli obiettivi», the rows by the list
  «Obiettivi in ordine di urgenza» (buttons named «{name}, {chip}», `aria-current` on the selected), the residual by the rowheader «Non assegnato», the
  disclosure by `/^Dettaglio/`, the split by the list «Ripartizione del versamento». The base account has no goals: a spec plants its own fixture
  (`goalBasedInvesting/{uid}` + the two settings flags with `merge: true`) and removes it.

## Per-page blind spots

- **FIRE › Calcolatore**: «FIRE nel {anno}» is the BASE scenario of a deterministic walk on the last full cashflow year (or the running year annualized, said in Base di calcolo) — changed expenses read stale until the year closes; a target reached «today» prints no passive-income clause; the Ventaglio runs only while open, its probability lives in the Traguardo footer; `getFIREData` still runs for runway and history but its `metrics` are ignored; the fan is unavailable without an allocation in the four MC classes; the pension-lock switch is optimistic (a failed save reverts with a toast), disabled in demo; Parametri reopens on every unsaved edit.
- **FIRE › Coast FIRE**: the verdict's two capital figures are net of the locked fund and only the lock sentence says so; the pension clause reads «la Pensione INPS» for labels starting with «Pension…», «la pensione di Giuseppe» otherwise (every pension listed, never counted); `coast.spec.ts` asserts structure and format only (the fixture fixes expenses, not the clock); the Ipotesi disclosure reopens on every unsaved edit or incomplete pension row, ONE save for four tiles; the «Impatto delle pensioni» table exists from 1440 only; `buildCoastInflowEvents` merges funds unlocking in the same year.
- **FIRE › Monte Carlo**: no Playwright spec; the paths are unseeded draws (two runs differ by tenths of a point) and the figures are the last run's until «Esegui» (an edited parameter only flags the Parametri footer); the plan is ephemeral, seeded once per mount; the withdrawal is always inflation-indexed; «fino a 81 anni» needs the Coast FIRE age; the histogram's last bin takes the tail past the 95th percentile (said in the footer); `results.medianFinalValue` has no surface.
- **FIRE › What If**: no Playwright spec; every event is a year-0 perturbation, nothing persisted; the Coast block reads the SAVED age and pensions (no age → no block); the job-loss picker seeds from `laborIncomeCategoryIds` once per mount; the «Prima e dopo» walk of today stops five years after its last scenario reaches FIRE (a gap after a big purchase, by design); with the bridge on the FIRE numbers are bridge numbers while the chart reads `baseNetWorth`; the Sensibilità reference expenses are session-only; `isPrimaryResidence` is informational.
- **FIRE › Obiettivi**: no Playwright spec; ONE `now` per mount; with three goals the Obiettivi tile leaves air under the rows; a goal past its deadline gets no pace; free shares under 0,5% / 0,50 € are not listed; the selection is session-only; the «assigned» bar counts the reached goals, the derived target does not; the two dialogs keep their old chrome and two pre-existing `react-hooks` errors.
