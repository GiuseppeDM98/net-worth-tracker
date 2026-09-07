# Centri di Costo

> **Quando aprire questa guida** — quando tocchi `components/cashflow/{CostCentersTab,CostCenterDetail,CostCenterDialog}.tsx`, `components/cashflow/cost-centers/*`, `lib/utils/{costCenterSummary,costCenterNarrative,costCenterUtils,costCenterColors}.ts` o `lib/services/costCenterService.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file: `CLAUDE.md` → *Key Files* → la voce «Centri di Costo». Nessuna spec Playwright dedicata (§ Per-page blind spots).

## Centri di Costo (`CostCentersTab`, `CostCenterDetail`, `components/cashflow/cost-centers/*`, `lib/utils/{costCenterSummary,costCenterNarrative,costCenterUtils,costCenterColors}.ts`)
- **NO period axis, by decision (2026-08-23).** A project's cost is its whole cost: every figure is lifetime («in
  totale») unless it names its window — `ytd`, `lastYear`, `trailingTotal`/`trailingAverage` (12 months), the
  ceiling's own `period`, `monthProjection`/`yearProjection`. The old `Mese|Anno|12 mesi|Sempre` picker,
  `filterExpensesByPeriod`, `computePeriodComparison` («vs precedente» has no honest predecessor without an axis),
  `projectAnnualCost`, `buildMonthlySeriesByCategory`, `buildComparisonSeries` and `CostCenterPeriod` are gone.
  Generalise: *a page whose question has no axis reads everything whole and lets each off-window tile name its
  window* (DESIGN.md → The Whole-Cost Corollary).
- **«In totale» is what is dated up to `now`.** `summarizeCenter` splits the rows at today: `total`/`count` are
  the booked ones, `scheduled` the rest (a materialised instalment, a recurring row). The scheduled rows are
  listed in Movimenti with an «in calendario» chip, counted in the aside («8 voci»), added as they are to every
  projection and to a ceiling's `spent` («impegnato» instead of «speso» in the copy), and never summed into the
  cost. A backdated row moves the total AND the crossing day retroactively.
- **The projection is the app's ONE rule on any window**: `projectWindowEndWithScheduled(spentToDate,
  scheduled, elapsedDays, totalDays)` in `spendingProjection.ts` (the month function delegates to it). The year
  uses `resolveYearCalendar` (`dayOfYear` from calendar fields in UTC — the DST trap — `canForecast` from day
  `MIN_YEAR_FORECAST_DAYS` = 28). **A dormant or archived center gets NO projection** (`lifecycle !== 'active'`
  → `yearProjection`/`monthProjection` null, the annual budget's `projection` null and `atRisk` false): a pace
  belongs to a project that is alive, and the verdict says «è fermo da 120 giorni» instead.
- **A monthly ceiling is Budget's `summarizeCeiling`**, mapped into `CenterBudgetSummary` — same crossing day
  (`crossedOn`, a day after today reads «supererai»), same `projectedCrossingDay`, same today's mark — so a
  center's tetto and the overall tetto never disagree. An annual ceiling is year-to-date on `resolveYearCalendar`
  and has no crossing day (like Budget's annual rows). `atRisk` = not over AND `Math.round(projection) > amount`
  (the gap is measured on the figure AS PRINTED).
- **Risk vs fact, again**: the list verdict ranks `over` (a crossed ceiling, negative) > `atRisk` (warning) >
  the most expensive center (neutral); two or more flagged centers are counted («2 centri rischiano di sforare
  il tetto.»). The dormant clause closes every sentence; a never-used center reads «non ha ancora spese», never
  «fermo da N giorni» (`idleDays` is null). The detail ranks archived > never used > over > dormant > holding >
  no ceiling («costa 124 € al mese» = `averageMonthly` = total / calendar months since the first expense).
- **A lifecycle threshold is fed an UNSCOPED date** — `resolveLastActivityDate(booked)`; `idleDays` is whole days
  between that date and today. Dormancy is a fact about the center, not about any window.
- **Every number is born in `costCenterSummary.ts`** (`summarizeCenter`, `summarizeCostCenters`,
  `buildCenterMonthStack`, `trailingMonthRefs`, `resolveYearCalendar`), every sentence in
  `costCenterNarrative.ts` (`buildCostCentersVerdict`, `buildCostCenterVerdict`, the `describe*` readings, asides,
  KPI captions and footers; `describeCenterChip` returns `{label, tone}` for the one chip a row may carry).
  Articles follow the printed figure (`articleForPercent`, `atThePercent` — «all'87%», «il 50%»); the copy uses
  the straight apostrophe like the other narratives, and the tests' `plain()` normalises it together with the
  nbsp. `CenterSummary` carries its `expenses` so the bars and the movements list read the same rows.
- **One stack component for both views**: `CenterStackBars` draws the trailing months stacked by center
  (`resolveCostCenterColor` per band, the running month at reduced fill and outlined, hover reading under
  `(pointer: fine)`, `legend={false}` for the detail's one-series stack). It replaced the Recharts line chart of
  «Confronta l'andamento»; `costCenterStyles.ts` keeps only `CHART_TICK_STYLE`, which Storico, FIRE and Coast
  import — do not delete the file with the views' last Recharts chart.
- **The query returns TWO numbers per center**, `spending` and `linkedCount`, and `deleteCostCenter` unlinks
  *whatever is linked*, income included, by writing `costCenterId: null` (never deleting the row) — **any count
  next to a destructive action must come from the same query the mutation runs.** The armed button's label names
  the count; Escape or a pointer outside disarms and the disarm is announced (emptying a live region announces
  nothing); disarm BEFORE delegating.
- **Session-only lenses are stored WITH their subject** (`{ id, keys }` for the subcategory exclusions,
  `{ id, count }` for the movements window): a stale id falls back to the default with no effect and no extra
  render (`react-hooks/set-state-in-effect`). The exclusion touches only the Per sottocategoria tile.
- **Rows that open a center are `<button>`s whose accessible name is their content** («Apri Fenicottero …»):
  a center sits in Centri AND in Dormienti when idle, so a spec scopes the locator to the tile
  (`getByRole('region', { name: 'Centri', exact: true })`) or `.first()` trips strict mode.

## Per-page blind spots

- **Centri di Costo**: no Playwright spec; `CostCenterDialog` keeps its pre-redesign chrome; an annual ceiling has no crossing day (`crossedOn` is monthly only); «Al mese» divides by the calendar months since the first expense (an idle project reads as a lower monthly cost, by design); «in totale» counts rows dated up to today (a future row is «in calendario»); the subcategory lens and the movements window (25 + «Mostra altre») are per-center, session-only state.
