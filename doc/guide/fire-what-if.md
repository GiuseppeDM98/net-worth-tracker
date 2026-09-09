# FIRE › What If

> **When to open this guide** — you are touching `components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*` (`tiles/*`, `WhatIfProjectionChart`, `incomeSelection.ts`), `lib/utils/{whatIfSummary,whatIfNarrative}.ts`, `lib/services/whatIfService.ts` or `types/whatIf.ts`. The page-wide rules — the pension unlock, `respectPensionLockInFire`, the bridge model, the config-first collapse, the Ventaglio engine, `deriveMonteCarloAllocation`, the goal math — live in `doc/guide/fire.md § FIRE, What If and Goals` and are not repeated here. In `AGENTS.md` only the stub with the essentials remains (§ FIRE, What If and Goals); modules and files: `CLAUDE.md` → *Key Files* → the **FIRE › What If** entry. No Playwright spec covers this tab.

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

## Per-page blind spots

- **FIRE › What If**: no Playwright spec; every event is a year-0 perturbation, nothing persisted; the Coast block reads the SAVED age and pensions (no age → no block); the job-loss picker seeds from `laborIncomeCategoryIds` once per mount; the «Prima e dopo» walk of today stops five years after its last scenario reaches FIRE (a gap after a big purchase, by design); with the bridge on the FIRE numbers are bridge numbers while the chart reads `baseNetWorth`; the Sensibilità reference expenses are session-only; `isPrimaryResidence` is informational.
