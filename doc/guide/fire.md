# FIRE, What If and Goals

> **When to open this guide** — you are touching the FIRE page as a whole (`components/fire-simulations/*`, `lib/services/{fireService,whatIfService,monteCarloService,goalService}.ts`, `lib/utils/{pensionUnlock,monteCarloParams,goalTrajectory,goalMath}.ts`) or its first tab, the Calcolatore (`components/fire-simulations/FireCalculatorTab.tsx`, `components/fire-simulations/tiles/*`, `lib/utils/{fireSummary,fireNarrative}.ts`). **The page-wide rules live here**, in § FIRE, What If and Goals — every citation in the repo points at that section — and the Calcolatore section follows, because the first tab shares the most with them. The other four tabs have a guide apiece, each opening with the same page-wide rules and closing with its own blind spots: `doc/guide/fire-coast.md` (Coast FIRE, `coastFireView.ts`), `doc/guide/fire-what-if.md` (What If, `whatIfSummary`/`whatIfNarrative`), `doc/guide/fire-monte-carlo.md` (Monte Carlo, `monteCarloSummary`/`monteCarloNarrative`), `doc/guide/fire-obiettivi.md` (Obiettivi, `goalsSummary`/`goalsNarrative`). In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals, which names the five files). Modules and files: § *Files* below. Fixture and E2E specs: `scripts/seedCoastFireE2E.mts`, `e2e/fire*.spec.ts` and `e2e/coast*.spec.ts` (`coast.mobile.spec.ts` and `fire.mobile.spec.ts` measure `main`'s overflow); the pension-lock emulator exercise script relies on `pensionUnlock` being override-only when there are no settings.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **FIRE**: Calcolatore `components/fire-simulations/FireCalculatorTab.tsx` + `tiles/*` + `{FireParametri,FireDettaglio,FIREProjectionChart,FireFanChart,FireYearDistributionView,SettledValue}.tsx`, pure `lib/utils/{fireSummary,fireNarrative,fireDistribution,yearHistogram,withdrawalTax,seededRandom}.ts`; shared `lib/services/{fireService,whatIfService,monteCarloService,goalService}.ts`, `lib/utils/{pensionUnlock,monteCarloParams,goalTrajectory,goalMath}.ts` (`pensionUnlock` = the single unlock resolution, `deriveMonteCarloAllocation`, `serializeGoalForFirestore` = the persistence allowlist); Coast `CoastFireTab.tsx` + `coast/*`, pure `lib/utils/coastFireView.ts`, `lib/hooks/useCoastFireSettingsDraft.ts`; What If `WhatIfAnalysisTab.tsx` + `whatif/*`, pure `lib/utils/{whatIfSummary,whatIfNarrative}.ts`, `types/whatIf.ts`; Monte Carlo `MonteCarloTab.tsx` + `components/monte-carlo/*` (`SCENARIO_SLOT`), pure `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts`; Obiettivi `GoalBasedInvestingTab.tsx` + `components/goals/*`, pure `lib/utils/{goalsSummary,goalsNarrative}.ts`; specs `e2e/fire*.spec.ts`, `e2e/coast*.spec.ts`, fixture `scripts/seedCoastFireE2E.mts`

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

- The tab owns three states — `view` (Scenari | Ventaglio | Distribuzione, the Traguardo tile's aside), the pension-lock switch
  (persisted on change) and the Parametri form (a preview until «Salva») — and computes nothing: numbers come from
  `fireSummary.ts` and `fireDistribution.ts` over the engines the tab already ran (`calculateFIREProjection`, `calculateFIREMetrics` +
  `calculateFireBridgeNumber`, `resolvePensionLockState`, `runAccumulationSimulation`), words from `fireNarrative.ts`.
- **The Distribuzione view is the FIRE year across the fan's paths** (2026-09-24, `lib/utils/fireDistribution.ts`,
  `components/fire-simulations/FireYearDistributionView.tsx`): `runAccumulationSimulation` already recorded each
  path's FIRE year (`fireYears`) and no screen read it. The view bins those years by calendar year (`binYears`,
  `lib/utils/yearHistogram.ts` — the ONE binning, shared with the Monte Carlo's Esaurimento; width 1/2/3/5/10 so a
  hand-written bar chart never labels forty columns), the base year's bin outlined, the paths past the horizon as one
  muted bar; three KPIs (the year by which one path in ten, half, nine in ten are FIRE — NEAREST RANK,
  `ceil(n × p) − 1`, not the fan's `floor(n × p)`: «nove percorsi su dieci entro il 2041» must be exactly true, ties
  included, and with exactly 10% never `floor` would read «never»); the reading names the median against the base
  and the «never» count as its own clause. **Not a Gaussian**: skewed right, cut by the horizon, a mass on «mai» —
  the view bins years and fits no curve. Rendered in FLOW, not in the Recharts' absolute box (`TraguardoTile` switches
  the wrapper on the view): its sentences take the height they need and can never overrun the footer; the bars are the
  one element that stretches. The footer says what the bars are, the method sits behind «Come si calcola»
  (`describeFireDistributionMethod`, the tile's `method` prop → `TileMethodNote`).
- **THE ONE RULE of the requirement is `resolveFireRequirement`** (2026-09-24, `fireService.ts`): what the free
  capital must hold at year t so that, retiring then, the expenses are covered — the state pensions taken off from
  their start, the tax on withdrawals added on what the portfolio funds, the locked fund arriving at its unlock. It is
  the Coast walk (`buildCoastFIRERetirementNeeds`) run from year t as the retirement day (`currentAge = età + t`,
  `currentDate = oggi + t`, expenses in year-t euro), with the new `portfolioNeedMultiplier` = 1/(1 − g_t·τ) on
  `max(E − P, 0)` — applied to what the portfolio funds, NEVER to the pensions, which arrive net. With nothing in it
  is expenses ÷ SWR; with the fund alone it is `calculateFireBridgeNumber`'s figure (kept, same walk). The walk
  (`calculateFIREProjection`, 8th param `honest: FireHonestInputs`) reads it per scenario per year for the reached
  test AND writes it into `*FireNumber` — so the Scenari chart's dashed line IS the target the verdict runs on, and
  **the fan's targets are those rows** (`resolveFanFireTargets(todayRequirement, projection)` →
  `AccumulationSimulationParams.fireTargets`; `buildBridgeFireTargets` lived for three hours and is gone). Until
  then the row printed expenses ÷ SWR while the test ran on the bridge figure, and the fan aimed at the number
  WITHOUT the lock under a verdict that named the bridge one: on the owner's mirror (lock on, unlock 2060) the
  Distribuzione read «Meno di metà dei percorsi è FIRE entro il 2066» under «FIRE nel 2049» and the lever asked
  for 67.000 € a year. Zero-volatility coherence: without pensions and tax `honest` passed or not is byte-identical
  (pinned); with the bridge the fan lands on the walk's year BEFORE the unlock (pinned); after it the two diverge by
  the compartment's growth (the walk merges the grown fund, the fan injects today's value — the documented model).
- **The state pensions are the Coast tab's, dated by the saved age** (`settings.coastFirePensions`,
  `coastFireTaxBrackets`, `userAge`): net through the IRPEF brackets and deflated with the scenario's inflation —
  `calculateCoastFireNetRealAnnualPension`, the SAME figure the Afflussi tile prints. **No age places no pension**
  and the Base di calcolo says so («non considerate: manca l'età in Coast FIRE › Ipotesi»); none saved is the row's
  «nessuna in Coast FIRE › Ipotesi: il numero le esclude» — never a silent «as if no pension». `FireTargetHonest`
  (`fireSummary.ts`) is what the tile's two rows, the caption («, meno la pensione dal 2060, tasse sui prelievi
  comprese»), `describeBase` («; nel numero anche …») and the verdict's closing clause read.
- **The tax on withdrawals is ONE rule in `lib/utils/withdrawalTax.ts`**: `resolvePortfolioTaxProfile` reads the
  FIRE-eligible assets minus the locked funds (`filterFireEligibleAssets`, the same set `currentNetWorth` sums) —
  basis = Σ quantità × PMC in euro, cash and pension funds AS basis (a fund's exit taxation is another regime,
  declared), an instrument with no EUR basis as basis too and COUNTED (`uncoveredCount`); τ is value-weighted on
  the positive gains (26% where an asset carries none); `null` when no instrument has a basis at all, and the row
  says «non stimate: nessun PMC in euro» — a gain share of 0 there would read «no tax» about a portfolio nobody
  measured. The gain share g_t = max(0, 1 − B_t/V_t) with the basis growing by every euro saved and by the fund at
  its unlock, never by the market; `withdrawGross(capital, basis, net, rate)` sells `net / (1 − g·τ)` and consumes
  the basis in proportion (average-cost logic), so a sale never moves the gain share — only the market does. Both
  engines read it: the fan's retirement ledger (`retirement: { statePensions, withdrawalTax }`) withdraws
  `max(0, E_t − P_t)` grossed up, the decumulation engine (`MonteCarloParams.annualInflows`, `withdrawalTax`) the
  plan's withdrawal net of the pensions active that year, indexed like it. What If rides the same inputs
  (`WhatIfBaseline.honest`), with the basis moved by the event: money that arrives (a windfall) is basis, money that
  leaves is sold at the portfolio's own gain share (`honestFor`). Coast takes `withdrawalTax` on the projection and
  reads the gain share on the capital grown to the target (a coaster adds no basis); its Ipotesi line says «tasse
  sui prelievi comprese (26% sulla plusvalenza)» or «non stimate».
- **The fan is SEEDED** (`FAN_SEED`, `createSeededRandom` in `lib/utils/seededRandom.ts`, mulberry32): the same inputs
  give the same thousand paths at every opening, and — the reason it exists — the lever re-runs on the SAME shocks
  (common random numbers), so a difference between two runs is the difference between two plans and not noise. The
  Monte Carlo tab stays unseeded: its «Esegui» is a new draw by design. `randomNormal` takes the source as a parameter
  and guards `log(0)` (a uniform can return exactly 0).
- **The lever on the bad tail** (`solveSavingsForTail`): the extra annual saving that brings the 90th-percentile FIRE
  year within the deterministic base year, by bisection over the injected runner (`run(annualSavings)`, ~13 seeded
  re-runs, under 100 ms), rounded UP to 100 € and RE-RUN so the printed figure is one that meets the target; the cap
  is `resolveLeverCap` (three savings, or the expenses, never under 12.000 €) and past it the sentence says what the cap
  buys instead. The lucky tail is named too («il 10% più fortunato passerebbe dal 2030 al 2029»): more saving weighs on
  both tails, and the sentence must not sell the lever as free. No lever without a base year (never within 50 years)
  or with a target already cleared (year 0): nothing to aim at, clause absent (The Narrative Honesty Rule).
- **«Dal FIRE in poi» is a second ledger on the SAME returns** (`retirementHorizonYears`, `retirements` in the engine):
  from the year after its FIRE year a path withdraws that year's inflated expenses instead of saving (inflow → return →
  withdrawal, the decumulation engine's order) and the ledger records the year the capital runs out; `paths` and
  `percentiles` (the fan) never change — the coherence test stays byte-identical, and one draw per path per year up to
  the retirement horizon is made whether or not a ledger still needs it. The horizon is age 90 with an age, 50 years
  from today without one (said in the sentence: no age, no «a 90 anni»), never past 70 years. `summarizeRetirementSurvival`
  reads the paths that RETIRE only (the never paths are the distribution's clause), and dates the worst tenth by nearest
  rank. No state pension and no tax, like the FIRE number itself — «Numero FIRE più onesto» is the next session.
- **Year 0 is a year** (2026-09-22): both walks test the target BEFORE stepping — `calculateFIREProjection` on the
  starting values (the bridge requirement before the unlock, the standard one after), `runAccumulationSimulation` on
  every path's starting portfolio — so a target already cleared today is `yearsToFIRE = 0`, never «tra 1 anno». Until
  then the Scenari tile printed «2027 · tra 1 anno» three times and the fan «entro il 2027: 100%» under a verdict
  that said «Sei già FIRE.». Downstream, 0 is a WORD: `ScenariTile` prints «oggi · già raggiunto», `describeScenarios`
  «Nel base il FIRE è già raggiunto; l'orso lo sposta al 2029, il toro concorda», `FanVerdict.atStart` turns the
  footer into «FIRE già raggiunto oggi, quindi in tutti i N percorsi…», and `FIREProjectionChart` draws no marker for
  it (the plot starts at year 1). `summarizeTimeline` reads no row for year 0 (`yearlyData[-1]` is the last row, not
  today). What If's `resolveYearsToFIRE` already patched this downstream; the engine now agrees with it.
- **The grid is Traguardo 5×2 | Base di calcolo 7, then Reddito passivo 4 | Scenari 3** (2026-09-22): Base took two
  rows at 3 columns and ended 190 px above its own footer, measured; at 3 columns beside Reddito the void moved into
  Reddito (173 px, measured the same day) — a tile shares a row only with tiles of its own height (AGENTS.md →
  Hierarchy). Base is the tallest, so it takes the first row alone, and its lock block sits BESIDE its rows through a
  container query (`@[560px]`: the same tile is a full card on a phone); Reddito and Scenari are within 30 px of each
  other and share the second row. The Traguardo's chart is the one element that can be any height and takes the
  slack. The tablet (768–1439) puts Base full width and Reddito beside Scenari; the phone order is unchanged
  (Traguardo → Scenari → Reddito → Base, `order-*`). The FOUR cells are module constants (`TRAGUARDO_CELL` …) shared
  by the data and the empty branches, so the two can never drift.
- **«Nothing recorded» keeps the four tiles** (2026-09-22, `describeEmptyTiles`): every tile keeps its eyebrow and
  says why it cannot answer, and ONLY the Traguardo offers the action — «Aggiungi il primo asset» → Patrimonio
  without a positive net worth, «Registra le spese nel Cashflow» → Cashflow without expenses. With a net worth and no
  expenses the Reddito passivo tile still ANSWERS (the allowance is the SWR of the net worth, `passiveIncome` is
  non-null there), so it renders its figures; Base di calcolo does not, because «Spese annue 0 €» would be the second
  name of an absence. Until then this state dropped the whole grid and linked nowhere. Pinned by
  `e2e/fire.degraded.spec.ts` (the degraded account has no cashflow rows, whichever pension scenario it holds).
- **The three charts' legends are `SeriesLegend`, their targets neutral ink dashed, their accessible names hue-free**
  (2026-09-22): bear/base/bull are chart SLOTS (4 / 0 / 1, `SCENARIO_SLOT`), and on a themed palette the bear is not
  red — the aria-label used to say «Orso (rosso)» while the fixture painted it green. Recharts' `<Legend>` measured
  3,11:1 and 3,77:1 on the tile. The FIRE-year markers of the Scenari chart are ONE per distinct year
  (`buildFireYearMarkers`, «FIRE Base · Toro»): three labels on one x overlapped and clipped. Whole euros in every
  projection tooltip; the axis ticks read `850k €`, since `formatCurrencyCompact` puts the euro after the figure.
- **No confetti** (2026-09-22): the one-shot burst inherited from the old FireReachedBanner is gone with its five
  hexes and with `shouldReduceMotion` (`celebrationUtils` keeps only the once-per-milestone record for the savings
  badge). A reached target is the verdict's sentence — the product reports, it does not cheer.
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
  their own doc. `enabled: !!user && !!ownerId` gates every query; `ownerId!` is safe past that gate. **The Coast
  form's hook was the one WRITE that sweep missed** (`useCoastFireSettingsDraft`, until 2026-09-23): it took both ids
  and wrote under the viewer's — a hook that takes a `userId` beside an `ownerId` is the tell; it now takes `ownerId`
  alone (doc/guide/fire-coast.md).
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
  dropped on request (2026-08-25): the Scenari chart and tile already carry what it listed. **A caption is a fact, so
  it takes the full muted ink** (2026-09-22): `text-muted-foreground/70` measured 2,60:1 in light on the thirteen
  captions that carry the window and the rule («124 € al mese», «fondo pensione bloccato escluso»). The muted token
  itself measures 4,38:1 on the tile in the default light theme — a `doc/guide/temi.md` debt, not this page's.
- **The Parametri form says an out-of-range value AT the field** (`aria-invalid` + `aria-describedby` on the SWR and
  the INPS age, the help line turning into the bound in `text-destructive`), and the toast on «Salva» repeats it in
  the product's term (SWR, never «Withdrawal Rate»). The Parametri trigger names the scenarios' growth in words
  («crescita orso 4%, base 7%, toro 10%»): «4/3,5 · 7/2,5» was a code. The Traguardo's chip reads «del numero FIRE»
  once the target is reached («verso FI» is a direction), and the progressbar's `aria-valuetext` says the true share
  where `aria-valuenow` is capped at 100.
- Playwright locates the tiles by `role=region` + `aria-label` («Traguardo FIRE», «Base di calcolo del FIRE», «Reddito
  passivo sostenibile», «Scenari di mercato»), the verdict by «Verdetto sul FIRE», the view switch by `role=group`
  «Vista della proiezione» (`aria-pressed` buttons), the switch by its `aria-label`, the two disclosure triggers by
  their VISIBLE text (`/^Parametri/`, `/^Dettaglio/` — no `aria-label`, so «Anteprima non salvata» is part of the
  name); the hero is `p:has-text("Numero FIRE") + span`, never «the first mono span» (the reading comes first). The
  Distribuzione's histogram is `[role="img"][aria-label*="Distribuzione dell'anno FIRE"]`, its method trigger the
  button «Come si calcola: Distribuzione dell'anno FIRE». The 390 guard opens Parametri, Dettaglio, the Ventaglio and
  the Distribuzione (the view with the most text) before measuring `main`.

## Per-page blind spots

- **FIRE › Calcolatore**: «FIRE nel {anno}» is the BASE scenario of a deterministic walk on the last full cashflow year (or the running year annualized, said in Base di calcolo) — changed expenses read stale until the year closes; a target reached «today» prints no passive-income clause, the Scenari rows say «oggi · già raggiunto» and the Scenari chart draws no FIRE marker for it; the Ventaglio and the Distribuzione run only while open, the probability lives in the Traguardo footer; **the fan is seeded** (since 2026-09-24): two openings show the same thousand paths and the same distribution — not a frozen cache, a fixed seed — while the Monte Carlo tab's «Esegui» still draws anew; **the Distribuzione's percentiles are nearest-rank** and can differ by a year from what the fan's bands suggest; **the number is net of the state pensions and gross of the tax only where the inputs exist** — a pension saved in Coast FIRE without a saved age is OUT (the Base di calcolo row says it), a portfolio with no EUR PMC pays no modelled tax (the row says it), and an instrument with no PMC counts as basis, so a foreign position before its backfill understates the tax; the tax reads the gain share at the FIRE year of the deterministic walk (basis = today's + savings + the fund), so a rebalance that realises gains today lowers tomorrow's estimate; the pension's net figure is the Coast tab's (IRPEF brackets on the real-at-start gross), one year of bridge whatever the month; the median of the paths can land AFTER the deterministic base year (volatility drag: the arithmetic-mean return of the walk overstates the median path) and the reading says «dopo il base»; the lever's «servirebbero +X € l'anno» is rounded up to 100 € and re-run, so a smaller figure may also work; «dal FIRE in poi» withdraws the expenses only — no state pension, no tax — so its survival understates a plan that has either; `getFIREData` still runs for runway and history but its `metrics` are ignored; the fan is unavailable without an allocation in the four MC classes; the pension-lock switch is optimistic (a failed save reverts with a toast), disabled in demo; Parametri reopens on every unsaved edit; the bridge number can stay put while the SWR moves (the pension floor binds) — the caption's «senza il vincolo sarebbe» is the figure that moves; the parameter inputs are native `type=number` and print `3.5` with a dot, a limit of the control the it-IT figures around it do not share; Recharts logs «The width(-1) and height(-1) of chart should be greater than 0» once when the Scenari or the Ventaglio mounts (the absolute box measures 0 on the first layout pass, then the chart draws) — seen in every Playwright run, harmless, the Distribuzione view (hand-written SVG) logs nothing.
- The blind spots of the other four tabs live at the end of their own guides: `doc/guide/fire-coast.md`, `doc/guide/fire-what-if.md`, `doc/guide/fire-monte-carlo.md`, `doc/guide/fire-obiettivi.md`.
- **Le 5 spec del Calcolatore FIRE falliscono se la suite E2E gira prima del 5 del mese**: `seedEmulator.ts` data le spese al giorno 5 del mese corrente e `getAnnualCashflowData` interroga «inizio anno → adesso», quindi la finestra è vuota. Artefatto della fixture, non una regressione. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
