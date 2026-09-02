# Cashflow › Tracciamento

> **Quando aprire questa guida** — chi tocca `components/cashflow/ExpenseTrackingTab.tsx`
> (stato, handler, la griglia; `applyListFilters` a livello di modulo) e
> `components/cashflow/tiles/*`, o le pure `lib/utils/{tracciamentoSummary,cashflowNarrative}.ts`.
> In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file:
> `CLAUDE.md` → *Key Files* → la voce *Cashflow › Tracciamento*. Le regole comuni a tutte le
> tab Cashflow (segno, ricorrenze, import, raggruppamento, drill-down, Sankey) vivono in
> `doc/guide/cashflow.md`.

## Cashflow › Tracciamento (`components/cashflow/ExpenseTrackingTab.tsx`, `components/cashflow/tiles/*`)
- **ONE period axis, two slices.** `expenses` = `filterExpensesByPeriod(allExpenses, period)` feeds the verdict and
  every tile; `filteredExpenses` = `applyListFilters(expenses, …)` feeds ONLY the Movimenti list (its aside says
  «12 di 47 voci» while narrowed, its reading counts the filtered rows). Before the redesign the toolbar also
  narrowed the KPIs — a savings rate computed over «Alimentari» is not a savings rate. Never route a tile through
  `filteredExpenses`.
- **Every number is born in `lib/utils/tracciamentoSummary.ts`** (`summarizePeriodCashflow`, `previousPeriod`,
  `computePeriodDelta`, `resolveAnchorMonth`/`resolveFlowWindow`, `buildTrailingMonthFlows`,
  `summarizeSavingsHistory`, `rankCategories`, `summarizeMovements`, `resolvePeriodCalendar`), every sentence in
  `cashflowNarrative.ts` (`buildCashflowVerdict`, `describePeriodSubject`, the `describe*` readings). Classification
  is by `type`; spending is a magnitude (`Math.abs`, the `calculateTotalExpenses` convention) and income a signed
  sum, so a refund raises the category and a reversed salary lowers income.
- **The previous period is honest or absent**: month → previous month; a closed year → the previous year; **a year
  still running → the SAME months of the previous year** (`previousPeriod(period, now)` returns a custom Jan 1 → end
  of the anchor month window, named «su gen–ago 2025» — eight months against twelve read as a drop by construction,
  which is what the old tab's `null` avoided); custom range → `null`. With a null predecessor every delta, the «su
  luglio» clause and the «vs luglio» captions disappear. A zero base is `null`, never `0%`, and a delta is judged
  on the PRINTED figure (`printedDelta`: 0,04% is «invariate»).
- **A period is its WHOLE calendar span, and what has not happened is DECLARED** (2026-08-28, changed from the
  year-to-date clip that shipped with the redesign). `filterExpensesByPeriod(expenses, period)` takes no clock:
  «il 2026» is January → December even in August, so a materialised instalment due in October is in the tiles AND in
  the list. `summarizeScheduled(expenses, now)` carries the part still ahead, and `scheduledSentence` — defined ONCE in
  `cashflowNarrative.ts` and imported by `analisiNarrative.ts` — closes both verdicts with «In calendario ci sono
  ancora 1850 € di spese e 500 € di entrate.» **The verb agrees with the AMOUNT, never with the number of clauses**:
  «1850 €» is plural however few clauses follow it, and only a lone «1 €» takes «c'è» — «1 €» meaning the figure AS
  PRINTED, so 1,40 € counts (the `articleForPercent` rule, applied to a verb). The sentence CLOSES on how far the
  figure reaches — «… da qui a fine mese / a fine anno / al 20 marzo» — and that horizon is the **period's** end, not
  the last scheduled row's: the amount is bounded by the window the reader is looking at, so «361 € entro ottobre»
  would be a different and smaller claim. Two resolvers, one per period type (`describeScheduledHorizon` for `Period`,
  `describeAnalisiScheduledHorizon` for `AnalisiPeriod`), both returning null where no end can be named (the history),
  so the clause is dropped rather than guessed. **The clause is a DECOMPOSITION and must say so**: it opens on «Nel
  totale» and closes the amount with «già in calendario», because the figure it names is INSIDE the total the verdict
  just printed. The bare existential form shipped until 2026-08-30 and read as an addition — «spese 2910 €. In
  calendario ci sono ancora 1850 €» invites the reader to sum to 4760 — and Centri di Costo says the same words about
  a total that genuinely EXCLUDES them, so on Tracciamento and Analisi the words have to be unambiguous.
  **A row dated after today is `isScheduledRow`** — after TODAY, by Italian calendar DAY and never by instant
  (`isItalyDayAfter`): a row saved from the dialog carries its creation time and the page's `now` is frozen at mount,
  so an instant comparison chipped a spesa recorded an hour ago. The same day rule governs `splitSpendingAtDate`,
  `budgetUtils`' two splits and `costCenterSummary`'s `isBooked`, so the four surfaces agree on what «oggi» is.
  A scheduled row takes the chip «In calendario» in the feed, the table and the detail drawer, and its amount drops
  the sign colour (the sign tokens mean gained and lost, and it is neither yet). The two month charts draw the months not started at reduced opacity, never outlined — the
  outline stays the month in progress. **The figures of a running year therefore contain a forecast; that is the
  owner's decision, and the page says so.**
- **«Da inizio anno» is a period of its own** (`Period` gained `{ kind: 'ytd'; year; throughMonth }`, and Analisi's
  `PeriodMode` gained `'ytd'`): January → the end of today's month, the window the whole-year rule above deliberately
  no longer is. `throughMonth` is STORED, never read off a clock, so `periodToRange` stays pure and the period is a
  fully-described value; the picker fills it from today. It is a kind and NOT a custom range because it HAS an honest
  predecessor — the same months a year earlier, `{ kind: 'ytd', year: year − 1, throughMonth }` — and a name of its
  own («2026 · gen–ago», never the bare year, which is a different period). Its subject is «Nel 2026 finora» on both
  pages, and it is the ONE window with no forecast in it, so `resolveComparisonScope` keeps it on `sameMonths`: the
  headline and the percentage measure the same months on both sides. **`'current'` compares FULL YEARS** since
  2026-08-30 (owner's call): its period spans gen–dic, so a `sameMonths` delta printed beside a whole-year total put
  two windows in one sentence. The cost is stated in that function's docblock and must not be silently reverted — the
  current side's remaining months hold only what is already booked, so the delta is biased DOWNWARD as the year runs,
  and it is the verdict's scheduled clause that keeps it honest. **It is NOT a window without scheduled rows** (corrected
  2026-08-30, three comments in the codebase claimed it was): `periodToRange` closes it on `endOfMonth(throughMonth)`,
  i.e. the END of today's month, so it carries the rest of this month — which is why
  `describeAnalisiScheduledHorizon` answers «a fine mese» for it. **Two conventions now coexist on purpose**: `expenseEntityStats` (a category's Scheda) and `cashflowNarrative` (Tracciamento) still measure a running year on the same months of the year before. They are honest because each NAMES its base («sugli stessi mesi del 2025»), so they were left alone — aligning them is a separate decision, not a cleanup.
- **Two windows stay anchored to today, on purpose, and must not be «fixed» to follow the period.**
  `resolveAnchorMonth` anchors the trailing SAVINGS HISTORY, which is history and must not run into months not lived
  (`resolveFlowWindow` is the period's own chart and does cover all twelve). `currentComparisonWindow(period, now)`
  scopes the DELTA's current side to January → the end of today's month, because the previous year has no December to
  match: twelve against eight is a rise by construction, the mirror of the drop `previousPeriod` already refuses. Both
  sides then cover gen–ago and `describeComparisonPhrase` names it. Analisi reaches the same place through
  `resolveComparisonScope` → `sameMonths`, which already computed both sides off `allExpenses`.
- **The month-end projection** exists only when the period IS the current Italian month (`resolvePeriodCalendar`)
  and extrapolates only what is booked up to today (`splitSpendingAtDate`): a row dated after today is added as it
  is, never scaled by the days left. The Panoramica's CashflowTile applies the SAME split through the payload's
  `currentMonth.expensesScheduled` (`DASHBOARD_OVERVIEW_SOURCE_VERSION` 10; absent → 0 on older cached payloads),
  so the two pages print one projection — the 2026-08-22 mismatch (6164 vs 5734) was exactly this rule applied on
  one page only.
- **Month windows are anchored** (`resolveAnchorMonth`): a month on itself, a year on today's month when current (the
  future is not data) and on December when past, a custom range on the month of its last day. The hero's bars take
  the trailing 6 (a year takes its own months from January), the savings history the trailing 12; both series are
  gap-free and bucketed by `getItalyYear`/`getItalyMonth`, while the period slice uses `periodToRange` (local time) —
  the same split `cashflowTimeSeries.ts` already lives with. **The running month is drawn but never ranked**
  (`summarizeSavingsHistory(months, now)` → `ongoing`/`closedCount`): its salary is in and its spending is not, so it
  would be «il mese migliore» by construction; the reading says «su 11 mesi chiusi». A window is called «ultimi N
  mesi» only when it ends today (`describeMonthWindow`/`describeFlowWindow`), else it is named by its bounds.
- **Italian tense is data**: `describePeriodSubject` returns `ongoing` (the current month/year, a custom range whose
  `to` is today or later) and the headline conjugates on it («sta andando bene» / «è andato bene», «tiene» / «ha
  tenuto»); the article before the savings rate follows the figure AS PRINTED (`articleForPercent(rate, 0)`, now
  exported from `patrimonioNarrative.ts` with `ofThePercent`). Tones: ≥ 20% positive, 0–20 neutral, a deficit or
  spending without income negative, no movement neutral.
- *Risparmio* (€) and *Rapporto* (`income/expenses`, printed «1,67×» through `formatNumber`) encode the same
  relationship in different units and are kept together **on purpose** — do not "deduplicate".
- **Feed delete = drawer-confirm, not 2-click**, and `deleteSingleExpense` MUST branch on `type === 'transfer'` to call
  `reconcileTransferDelete` (both legs), like `ExpenseTable` does. The feed keeps `surface="flat"` on every width (a
  card per day inside the Movimenti tile would be a card inside a card); `ExpenseTable` is desktop-only, so with the
  «Tabella» view selected the tile renders the table `hidden desktop:block` and the feed `desktop:hidden`.
- **Two pieces of state are derived, not reset**: the feed's visible window is stored WITH the filter key it was
  opened under (`feedWindow`, falls back to the first page when the key changes) and the account filter is read
  through `effectiveAccountId` (an account absent from the period is no filter) — both were `setState` in an
  effect. `filteredExpenses` is deliberately NOT wrapped in `useMemo`: the compiler could not preserve it and the
  skip un-memoized the whole component.
- **`CategoryTile` takes an optional `reading`** (the Panoramica passes none): the rows keep the overview payload's
  shape (`category`, `categoryKey`, `amount`, `percentage`) so `rankCategories` feeds the same component, and the
  residual row appears only when categories were cut.
- **Below `desktop:` the period stays under the verdict and the filters move INTO the Movimenti tile**
  (`MobileFiltersDrawer showPeriod={false}` in the tile's `mobileToolbar` slot): the drawer narrows that list, and
  four tiles away from it the badge read as unrelated. «Ripristina» (desktop toolbar and drawer alike) resets the list
  filters and the sort, **never the period** — the axis belongs to the picker — and `hasActiveFilters` no longer
  counts a non-current month as a filter. The landscape «Aggiungi» button lives beside the period
  (`max-desktop:portrait:hidden`): in portrait the bottom-nav FAB (`cashflow:add-expense`) is the only add
  affordance, in landscape the FAB is gone.
- **Hover readings are one primitive** (`components/ui/chart-hover.tsx`): `useChartHover(count, 'slot' | 'nearest')`
  returns `enabled` (`(pointer: fine)` via `useMediaQuery`), the index and the pointer handlers; spread the handlers on
  the `relative` plot box only when `enabled`, so a touch device never mounts the overlay. The tip is HTML, never an
  SVG element — a `preserveAspectRatio="none"` plot would stretch it — and `NetWorthSparkline`'s overlay is
  `absolute inset-0` against the CALLER's positioned box (the hero's), which is why `interactive` requires one.
- **Asides, footers and chart sub-eyebrows are `Narrative`s, not strings** (`describeMovementsCount`,
  `describeDeficitMonths`, `describeMonthWindow`, `describeFlowWindow`) rendered through `NarrativeText`, so every
  count and year in them is mono — the Tile's `aside` slot carries no `font-mono` of its own.

## Per-page blind spots

- **Tracciamento**: «Tabella» renders `ExpenseTable` unchanged inside Movimenti; the period slice uses `periodToRange` (browser local time) while the month buckets use the Italian calendar; the phone bar's controls are 36px; `TransactionFeed`/`CompactExpenseRow` carry two pre-existing `react-hooks` errors; a custom range has no previous period; the month-end projection exists only in the current month; `components/dashboard/overview/NarrativeText.tsx` is an unused re-export (knip).
