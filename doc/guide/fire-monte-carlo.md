# FIRE › Monte Carlo

> **When to open this guide** — you are touching `components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*` (`tiles/*`, `MonteCarloFanChart`, `FinalValueBars`, `ScenarioOverlayChart`, `MonteCarloDettaglio`), `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts` or `lib/services/monteCarloService.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `CLAUDE.md` → *Key Files* → the **FIRE › Monte Carlo** entry. No Playwright spec covers this tab.

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

## Per-page blind spots

- **FIRE › Monte Carlo**: no Playwright spec; the paths are unseeded draws (two runs differ by tenths of a point) and the figures are the last run's until «Esegui» (an edited parameter only flags the Parametri footer); the plan is ephemeral, seeded once per mount; the withdrawal is always inflation-indexed; «fino a 81 anni» needs the Coast FIRE age; the histogram's last bin takes the tail past the 95th percentile (said in the footer); `results.medianFinalValue` has no surface.
