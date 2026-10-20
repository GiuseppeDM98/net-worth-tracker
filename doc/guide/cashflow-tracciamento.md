# Cashflow › Tracciamento

> **Quando aprire questa guida** — chi tocca `components/cashflow/ExpenseTrackingTab.tsx`
> (stato, handler, la griglia; `applyListFilters` a livello di modulo) e
> `components/cashflow/tiles/*`, o le pure `lib/utils/{tracciamentoSummary,cashflowNarrative}.ts`.
> In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file:
> § *Files*, sotto. Le regole comuni a tutte le
> tab Cashflow (segno, ricorrenze, import, raggruppamento, drill-down, Sankey) vivono in
> `doc/guide/cashflow.md`.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Cashflow**: `app/dashboard/cashflow/page.tsx`; Tracciamento `components/cashflow/ExpenseTrackingTab.tsx` + `components/cashflow/{TransactionFeed,CompactExpenseRow,MobileFiltersDrawer}.tsx` + `components/expenses/ExpenseTable.tsx` (the «Tabella» view: armed row delete, `SeriesDeleteDialog`), pure `lib/utils/{tracciamentoSummary,cashflowNarrative,movementsOwnerFilter}.ts` (`settleTotals` = the lived part the verdict judges; `currentComparisonWindow`/`previousComparisonWindow` = the two comparable windows, same days of the previous month for the month in progress; the «Intestatario» filter and the owner chip), `lib/constants/expenseTypeColors.ts` (the ONE type→colour map: dot, badge, flow series), specs `e2e/cashflow.{tracciamento,mobile,owner,accounts}.spec.ts`
- **Suites to run after a change here — Cashflow › Tracciamento** (moved from `AGENTS.md` § Commands on 2026-09-30): `tracciamentoSummary`, `cashflowNarrative` (with `describeTrackingClosedAnswers`, the landscape index), `tabletComposition` (+ `overviewNarrative` for `projectMonthEndSpending`, `patrimonioNarrative` for the articles)

## Cashflow › Tracciamento (`components/cashflow/ExpenseTrackingTab.tsx`, `components/cashflow/tiles/*`)
- **ONE period axis, two slices.** `expenses` = `filterExpensesByPeriod(allExpenses, period)` feeds the verdict and
  every tile; `filteredExpenses` = `applyListFilters(expenses, …)` feeds ONLY the Movimenti list (its aside says
  «12 di 47 voci» while narrowed, its reading counts the filtered rows). Before the redesign the toolbar also
  narrowed the KPIs — a savings rate computed over «Alimentari» is not a savings rate. Never route a tile through
  `filteredExpenses`.
- **The tab is handed the rows of ITS WINDOW, and a new period is a new read** (2026-09-30,
  `trackingWindow` in `lib/utils/expenseWindows.ts`; the rule in doc/guide/cashflow.md § Expenses by window): the
  period and the twelve months before it, to the end of the month the period ends in — what `previousPeriod`, the
  two comparison windows, the flow chart and the savings history read behind the period. The period state lives in
  `app/dashboard/cashflow/page.tsx`, beside the read that follows it (`period` / `onPeriodChange` are props, and the
  page's freshness reading covers that key). While a window is read for the first time — or its read failed — the
  two pickers stay MOUNTED, the same elements with their focus, and only the verdict and the tiles give way (a
  `VerdictSkeleton` and the grid's skeleton, or the notice): the tab has two returns that share `periodRows` and
  `dialogs` at the same positions. A period already opened in the last 24 hours paints from the cache. The pickers'
  years come from the collection's bounds (`availableYears`, `listExpenseYears`), not from the rows on screen.
  Pinned by `__tests__/expenseWindows.test.ts` (every reader on the window and on the whole list, nine periods,
  three «today»s) and by `e2e/cashflow.tracciamento.spec.ts` › «a row dated next year shows when the period moves
  there» (seen red with `range` keyed outside the `expenses.all` prefix, and with the page reading this month's
  window whatever the period).
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
- **The verdict judges what has HAPPENED, and a second sentence says where the calendar takes it** (2026-09-14, the
  owner's call after the critique). With nothing in the calendar the totals ARE what happened: one sentence, as before.
  With something ahead, `buildCashflowVerdict` takes headline, tone and the first sentence from `settleTotals(totals,
  scheduled)` — the period's totals minus the scheduled slice, «A settembre finora le spese superano le entrate di 355
  €: entrate 302 €, spese 656 €» — and closes with `calendarSentence`: «Con 1297 € di spese e 2456 € di entrate già in
  calendario da qui a fine mese, il mese chiude a +805 € (il 29%).» On the 14th the mirror printed «Settembre sta
  andando bene · 29%» on a salary dated the 15th. **Both sides of the calendar are ALWAYS named**, an empty one as
  «nessuna entrata attesa» / «nessuna spesa attesa»: an instalment plan writes its future rows and a salary is not
  recurring (`canTypeRecur`), so «Quest'anno» holds three months of instalments and no income — the 4% it produces
  against the 10% of «Da inizio anno» is the calendar's asymmetry, and the sentence has to say so. The closing figure
  is the PERIOD's total, the one the tiles print, so the two sentences meet on the same number; a period nothing has
  happened in yet reads «Nessun movimento ancora nel 2043.» and only the calendar sentence. `scheduledSentence` («Nel
  totale ci sono ancora …») is no longer Tracciamento's — Analisi still closes with it. A future period is `ongoing`
  (`describePeriodSubject`: `>=`, not `===`): «nel 2043 hai speso» was the past tense on a year of instalments.
- **The month in progress is compared with the SAME DAYS of the previous month** (2026-09-14): `currentComparisonWindow`
  returns the 1st → today and `previousComparisonWindow` the 1st → the same day of the previous month (clamped to its
  length: the 31st of October against the 30 days of September), `describeComparisonPhrase` says «sui primi 14 giorni
  di agosto» and the KPI caption «vs 1–14 ago». The default view printed «in calo del 59,8% su agosto» on the 14th —
  fourteen days plus the calendar against thirty-one — while the same function refused that asymmetry for a running
  year. **`previousPeriod` still returns the whole previous month** for the projection's reference («Ad agosto 4854
  €»): a reference for where the month lands is the whole month, a delta on what has been lived is not. A month not
  yet begun has no comparison at all (both windows null, phrase and caption dropped).
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
- **The detail names the account a row moves, and when** (2026-09-19): «Conto · Fenicottero · si muove il 22 settembre»
  while the row waits for its date (`balancePending`), «Conti · origine → destinazione» for a transfer; the armed delete
  says the account is credited back only when the row has APPLIED its effect (`appliedBalanceEffectsOf`). A series row
  adds «Collega la serie a un conto…» under the facts (`LinkSeriesDialog`, owned by `ExpenseTrackingTab`), hidden in demo.
- **Feed delete = the detail's ARMED footer** (2026-09-18; it was a confirm drawer nested in the detail drawer): the
  detail is a `ResponsiveModal` `sm`, «Elimina» arms through `useArmedDelete` and the reading prints
  `describeExpenseDeleteConsequence` until the second press or a disarm (`describeMovementDetailReading`); a row of a
  series skips the arming and reaches `SeriesDeleteDialog` on its first press. The «Tipo» and «Note» rows left the
  detail: the eyebrow carries the type («Movimenti · Spesa non necessaria») and the title IS the note, printed whole.
  `deleteSingleExpense` MUST branch on `type === 'transfer'` to call
  `reconcileTransferDelete` (both legs), like `ExpenseTable` does. The feed keeps `surface="flat"` on every width (a
  card per day inside the Movimenti tile would be a card inside a card); `ExpenseTable` is desktop-only, so with the
  «Tabella» view selected the tile renders the table `hidden desktop:block` and the feed `desktop:hidden`. **The
  «Feed | Tabella» choice is remembered** (`localStorage`, `cashflow.movimenti.vista`, 2026-09-14), like Patrimonio's
  toggles.
- **The table's delete is the row's, and a series is a modal** (2026-09-14, both surfaces off the raw `AlertDialog`): a
  plain row arms in place (`useArmedDelete`, no timer, «Conferma» on the button, the consequence printed in the Note
  cell — `describeExpenseDeleteConsequence`: «Eliminando, il conto viene riaccreditato di 373,81 €» — and ONE live
  region per table); a row of an instalment plan or a recurring series opens `SeriesDeleteDialog` («solo questa o tutte
  le 12?», a `ResponsiveModal` `sm`), the same modal the feed's detail drawer reaches through `handleDeleteExpense`
  (`resolveSeriesDeleteMode` is the one rule). Every `<th>` names its column (`scope="col"` is now `TableHead`'s
  default), the sorted header carries `aria-sort`, and Data and Importo are mono (`FIGURE_CLASS`).
- **An expense type has ONE colour map** — `lib/constants/expenseTypeColors.ts` (dot, badge, the two flow series);
  see AGENTS.md → Layout and Color Tokens. The «Tutte le categorie in Analisi» footer link is a
  `TILE_FOOTER_ACTION_CLASS` target (32/44px), and `RankedRows` hides its share column under a 250px container
  (`@max-[250px]:hidden`): the three percentages of «Entrate per categoria» were painted outside the `col-span-3`
  tile at 1440, and `e2e/cashflow.tracciamento.spec.ts` measures every list against its tile.
- **Two pieces of state are derived, not reset**: the feed's visible window is stored WITH the filter key it was
  opened under (`feedWindow`, falls back to the first page when the key changes) and the account filter is read
  through `effectiveAccountId` (an account absent from the period is no filter) — both were `setState` in an
  effect. `filteredExpenses` is deliberately NOT wrapped in `useMemo`: the compiler could not preserve it and the
  skip un-memoized the whole component.
- **`CategoryTile` takes an optional `reading`** (the Panoramica passes none): the rows keep the overview payload's
  shape (`category`, `categoryKey`, `amount`, `percentage`) so `rankCategories` feeds the same component, and the
  residual row appears only when categories were cut.
- **Below `desktop:` the period stays under the verdict and the filters move INTO the Movimenti tile**
  (`MobileFiltersDrawer` in the tile's `mobileToolbar` slot — the name is older than the surface: since 2026-09-18
  it opens a `ResponsiveModal` `sm`, a sheet on a phone and a dialog on the tablet widths the bar also serves): it
  narrows that list, and four tiles away from it the badge read as unrelated. Its reading and its primary COUNT
  (`describeMovementsFilterReading`/`describeMovementsFilterAction` on `filteredExpenses.length` and
  `expenses.length`, the two lists the tile draws — never a third count). **Since 2026-09-07 the drawer's bar repeats the period picker** beside «Filtri» and
  the sort (PR #332): a search («caffè») is read over a window, and with the only picker four tiles up, changing the
  window meant scrolling away from the answer. It is a second handle on the SAME `period` state — never a second
  axis — with its own accessible name («Periodo dei movimenti») and `min-w-0` over the trigger's `min-w-[190px]`,
  so the picker yields before «Filtri» and the sort when a phone runs out of room; `e2e/cashflow.mobile.spec.ts`
  measures `main` at 390 and 360 (green even with the override removed — it pins the fit, not a fix) and drives the
  page's period from the tile. «Ripristina» (desktop toolbar and drawer alike) resets the list
  filters and the sort, **never the period** — the axis belongs to the picker — and `hasActiveFilters` no longer
  counts a non-current month as a filter. The landscape «Aggiungi» button lives beside the period
  (`max-desktop:portrait:hidden`): in portrait the bottom-nav FAB (`cashflow:add-expense`) is the only add
  affordance, in landscape the FAB is gone.
- **The Movimenti tile's reading totals each type of the rows it is handed** (a search on a note is its own total).
  (Moved here from the `AGENTS.md` stub on 2026-09-20.)
- **«Intestatario» is a list filter that exists only with Divisione on** (2026-09-11,
  `lib/utils/movementsOwnerFilter.ts`): the page hands the tab `splitEnabled` and `familyMembers`, and the Select —
  desktop toolbar and the phone drawer alike — offers «Tutti · In comune · {members}», plus «Senza intestatario» only
  when the PERIOD holds rows of a deleted member (`listOwnerFilterOptions`). Absent or blank `personalMemberId` is
  «in comune», the same contract as `expenseSplitSummary`. A selection the options no longer offer (the feature
  switched off, a member removed) is no filter — `effectiveOwnerId`, derived like `effectiveAccountId`, never reset in
  an effect. It counts in `hasActiveFilters`, the drawer badge, the feed's `filterKey` and «Ripristina»; it narrows
  ONLY the Movimenti list, and since the tile's reading totals the rows it is handed, «Spese di Giuseppe: 522 € su
  12 voci» comes for free. **With the feature on, an attributed row also prints its owner as a chip** (feed, table,
  detail drawer: `resolveOwnerLabel` — the name, or «Senza intestatario»); a shared row prints nothing, so the default
  case stays clean. `memberNames` is `null` when the feature is off, so no row is ever labelled by a feature the
  account does not use.
- **Hover readings are one primitive** (`components/ui/chart-hover.tsx`): `useChartHover(count, 'slot' | 'nearest')`
  returns `enabled` (`(pointer: fine)` via `useMediaQuery`), the index and the pointer handlers; spread the handlers on
  the `relative` plot box only when `enabled`, so a touch device never mounts the overlay. The tip is HTML, never an
  SVG element — a `preserveAspectRatio="none"` plot would stretch it — and `NetWorthSparkline`'s overlay is
  `absolute inset-0` against the CALLER's positioned box (the hero's), which is why `interactive` requires one.
- **Asides, footers and chart sub-eyebrows are `Narrative`s, not strings** (`describeMovementsCount`,
  `describeDeficitMonths`, `describeMonthWindow`, `describeFlowWindow`) rendered through `NarrativeText`, so every
  count and year in them is mono — the Tile's `aside` slot carries no `font-mono` of its own.
- **A save lands in place — the tab's `loading` is its OWN two keys, never a sibling tab's read** (2026-09-29, the
  owner's tour of the persisted cache): `app/dashboard/cashflow/page.tsx` gates Tracciamento on `expensesLoading ||
  categoriesLoading` alone. Until then the Dividendi tab's own read (`/api/dividends` in the page's state, then) was in it,
  and `handleRefresh` (called after every save and delete) reread the dividends even with that tab never opened, so
  every saved expense put the skeleton over the month for the length of a call Tracciamento never uses. The dividends
  gate only their tab and are reread only while it is mounted; a save is an invalidation of the three keys, so the
  counters and the list move without a remount. Pinned by `e2e/cashflow.tracciamento.spec.ts` › «a saved expense
  lands in place» (the page-skeleton count before and after the write, the row and the counter, the write read back
  from Firestore, the row removed BY THE APP).

## Composizione mobile

Composed on 2026-10-12 (PR #454; its spec, retired the same day, is in `git log -- doc/mobile/`; the primitives in doc/guide/hall-of-fame.md § Composizione mobile): below `desktop:` the tab is one sequence, the desktop DOM (the DOM order is the reading order — DESIGN.md → The First-Screen Rule, 2026-09-27); at 1440 nothing changes but the verdict's scope line and the two states that wait or fail, which now sit inside the verdict's `section` (`PageVerdict.pending`, below). The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this tab does with them.

- **THE tile**: Cashflow del periodo (`trk-periodo`), open at every width, never a row (DESIGN.md → The First-Screen Rule, 2026-10-10); below `desktop:` its bars yield — `FlowBarsChart` at `min-h-[120px]`, the caller's `minHeight` only from `desktop:` through `--flow-min-h` (the chart yields, never the reading — 2026-09-27) — the reading, the deltas and the projection stay.
- **The strip** (`selectTracciamentoStrip({ totals })`, `lib/utils/tracciamentoSummary.ts`): the PERIOD's trio — «Entrate» (positive when > 0) → `trk-entrate`, «Spese» (negative when > 0) → `trk-spese`, «Risparmio» (no tone) → `trk-risparmio` — three `currency` cells, none when nothing came in or out; each prints EXACTLY what the trio prints — the net through ONE formatter, `formatEuroMinus` (`lib/utils/formatters.ts`), which the tile calls and the test imports (`__tests__/tracciamentoSummary.test.ts` holds the identity, the «−» U+2212 and the unsigned zero: a net that prints as zero, −0,3 €, takes no sign on either side since 2026-10-12).
- **Lifted blocks**: the trio is **lifted whole** (`lifts: { section: 'trk-periodo', block: 'trio' }`, the owner's choice of 2026-10-10): `CashflowKpiTrio.lifted` hides the three VALUES below `desktop:` (`LIFTED_FIGURE_CLASS`, the tablet included since 2026-10-16: whole beside the strip it read the same figures twice), the labels, the deltas, the savings rate and the coverage stay; at 1440 the trio is whole, which stays drawn up to 1439. `liftedBlocks(strip, 'trk-periodo')` → `CashflowPeriodoTile.liftedFigures`, guarded by `isCashflowPeriodoLiftedBlock`.
- **The rows and their aside, in DOM order** (`TRACKING_SECTIONS`, module-level; ids `TRACKING_SECTION_IDS`): `trk-spese` and `trk-entrate` («per categoria»), `trk-risparmio` («mese per mese»), `trk-movimenti` (`describeMovementsCount`: «12 voci», «4 di 12 voci» with filters; `TRACKING_CLOSED_ASIDES`); `TILE_ROW_CELL_CLASS` on their cells. Movimenti's own picker is the second handle of the page's period, inside the row once open.
- **The «+» opens Movimenti on the row it saved** (the owner's choice of 2026-10-10): `ExpenseDialog.onSuccess(saved: SavedExpense | null)` — `{ id, row }` from `createExpenseSettledOnDate().parents` (fees excluded) on a create; on an edit the row is rebuilt from the FORM's data with plain values (never a `deleteField()` sentinel, which the update carries), so `null` never arrives today — and, on a phone, when the row is in the period AND passes the list's filters (`filterExpensesByPeriod`, `applyListFilters` on the ROW: the list in that closure precedes the refetch), `savedRowId` + `sections.reveal('trk-movimenti')`; `TransactionFeed.focusRowId`/`focusRowRef` widen the window to the row (`data-expense-id` sits on the row's button) and focus its button when it lands, and the dialog's `returnFocusTo={savedRowRef}` sends the focus there on close instead of the FAB. A row out of the period or filtered out opens nothing (the toast says it saved). «Carica altri» then counts its page from what the feed SHOWS (`growFeedWindow` in pages of `FEED_PAGE_SIZE`, `lib/utils/tracciamentoSummary.ts`, since 2026-10-12: counted from the stored window it took rows away — the row at index 50 showed 51 and the press left 40). In demo the FAB is not drawn and the event opens nothing (`isAddExpenseFabShown`, `lib/utils/navUtils.ts`, since 2026-10-12: until then a save from the FAB wrote to the shared account). The id is forgotten by the next gesture — a period, a filter, the sort, «Ripristina», «Carica altri», another save — never by an effect.
- **`binding` clauses and the `scope`**: no `binding` segment — `buildCashflowVerdict` (`lib/utils/cashflowNarrative.ts`) marks none, so the cut below always stands; the `scope` is the scope line.
- **The scope line** (`describeTrackingScope(period, now, scheduled)`, `lib/utils/cashflowNarrative.ts`; DESIGN.md → The Binding-Clause Rule, 2026-10-10): «Nel totale ci sono ancora 1850 € di spese e 500 € di entrate già in calendario da qui a fine mese.» — the trio's totals are the period's, and the scope says how much of them is still ahead; `null` with nothing scheduled; rendered twice by `PageVerdict` (after the strip below `desktop:`, under the paragraph at 1440).
- **The cut** (`buildCashflowVerdict`): with a calendar and a lived part, `leadLength` ends the lived sentence and «Il perché · dove chiude il periodo» holds the projection; without a calendar, or with the calendar alone, `leadLength: 0` — the «solo titolo» deroga (DESIGN.md → The Binding-Clause Rule, 2026-09-27): the first sentence would reprint the strip — and «Il perché · le cifre del periodo»; nothing in and nothing out (`«Nessun movimento registrato.»`, «Solo N trasferimenti…») has no strip and no cut (the owner's choice, 2026-10-12).
- **The axis** (DESIGN.md → Page Verdict, 2026-09-27): `PeriodPicker` and the landscape «Aggiungi» in `PageVerdict.axis`, under the title, in EVERY state — `pending` (`{ kind: 'loading' }` / `{ kind: 'failed', notice }`, since 2026-10-10 and 2026-10-12, doc/guide/stati.md) keeps the slot as the second child so the picker that asked for the new period keeps its focus; the desktop picker beside the verdict is a second instance (`hidden desktop:block`).
- **Absences**: loading and a failed read are the whole tab's (`pending`): no strip, no scope, no rows; the axis stays. The failed read is one `ErrorNotice` in the verdict's slot — no row ever carries `failed` (`TRACKING_SECTIONS`), so `PageRest` has nothing to announce. Nothing recorded in the period is the verdict's «Nessun movimento registrato.», with no strip and no cut (The cut, above).
- **The memory**: `mobile-sections:cashflow:tracking` (`useMobileSections({ route: 'cashflow', tab: 'tracking' })`; per device and browser, not per account); absent or unreadable → the tab's defaults, every row closed (no `defaultOpen`). «Il perché» as the row `trk-perche`; `active` (from `effectiveTab`) remounts `PageRest` on activation, so its `role="alert"` is the showing tab's (doc/guide/cashflow.md § The tabs load their code on demand).
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`, `useTabletComposition` + `useTabletStage`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage; the landscape tablet's spec, retired on 2026-10-16, is in `git log -- doc/mobile/`): at 768 two columns — Cashflow del periodo on both, «Il resto» on a row of its own, Spese beside Entrate and Risparmio beside Movimenti, an open row and a closed one left alone (Spese, before an open Entrate) on the whole grid row; THE tile ends above the pill, the first closed row 47px under it on the census fixture (recorded `false` with a `raisedBy`, doc/guide/prima-schermata-misure.md § Registro delle voci allargate; above it on the base account). **On a tablet in landscape** (a content box ≥ 880px below 1440: 936 at 1024×768 beside the icon rail) the tab is a STAGE: on the left the short verdict (title, the axis, «Il perché», the strip on one row) and Cashflow del periodo under it, 16px apart, sticky while the page scrolls when the left stack fits the screen, the tile reaching the fold; on the right the 360px INDEX, ONE card with «Il resto» and the four rows flat under hairlines, each opening in place — the strip and the «+» open their row where it stands. **«Aggiungi» in the axis is 44px** (`h-11`): in landscape the pill and its «+» are gone and it is the one add affordance; the header's Impostazioni icon is 44px too.
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, 2026-10-16, landscape only; `describeTrackingClosedAnswers({ expenseRanking, incomeRanking, savingsHistory })` in `cashflowNarrative.ts`, through `RowAnswers`; a `null` keeps the row's aside, and below landscape every row keeps it):
  - Spese / Entrate: the ranking's first category «{cat} {%}» (`Math.round`); «tutto in {cat}» / «tutto da {cat}» with one category, «quasi tutto in/da {cat}» when the first rounds to 100 beside others; null with no row (`describeCategoryShareAnswer`).
  - Risparmio: «in media il/l'/lo {%}» (integer, the article bound to the figure), «in media −{%}» in the loss colour on a negative printed average; null with no closed month that had income, or with one measured month.
  - Movimenti: null — it keeps its count («12 voci», «4 di 12 voci»).
- **The specs**: `e2e/mobile-composition.cashflow.mobile.spec.ts` (the first screen with the rate and the coverage still shown, the scope with a row planted at NOON of the month's last day — its late evening is the next month in Rome under summer time —, the «+» and the focus, «Apri tutte» and the overflow, reduced motion), `e2e/cashflow.mobile.spec.ts` (opens Movimenti first). Not proven in a browser: the picker keeping its focus through a wait or a failed read (held by the structure of `PageVerdict.pending` alone).
- **The tablet specs**: `e2e/cashflow.tablet.spec.ts` (`tablet` and `tablet-landscape`: two columns at 768 and the landscape stage with the first closed row above the fold, an opened row in place in the index at 1024 and across the grid at 768, a rotation with Movimenti open and every row open with the left stack still and nothing past `main`, the tabs at 44×44, the «+» at 768, «Aggiungi» 44px at 1024 with no «+», 1440 unchanged).

## Per-page blind spots

- **The trio's spending arrow repeats the first sentence's pacing on a phone** (seen 2026-10-15 on the census fixture, once the previous month's same days hold rows: «in aumento del 121,2%» in the sentence and «↑ 121,2%» under Spese, 7 figures outside the verdict at 390): Analisi lifts that arrow (`CashflowKpiTrio`'s `expensesDeltaLifted`, since 2026-10-14), Tracciamento does not — the owner's call that day was for Analisi alone. Whether to lift it here too is a decision not taken; `perf/mobile-budget.json` records the 7 with its `raisedBy`.
- **The trio loses its three figures at 390** (2026-10-12): the strip prints them, THE tile keeps the labels, the deltas, the rate and the coverage, up to 1439 (on a tablet too since 2026-10-16); whole at 1440, where there is no strip. **The title stands alone** over the strip whenever the month has no calendar ahead («Il perché · le cifre del periodo»): the first sentence would reprint the three cells, so the «solo titolo» deroga (DESIGN.md → The Binding-Clause Rule) is declared here, not a cut gone missing. A row saved out of the period, or that the list's filters would hide, opens no row and moves no filter — the toast is the only sign. With nothing in and nothing out the verdict is whole, no «Il perché».
- **Tracciamento**: a period never opened before shows the tiles' skeleton while its window is read (the pickers stay), and the pickers offer every year between the oldest and the newest row, one with no row included; the period slice uses `periodToRange` (browser local time) while the month buckets use the Italian calendar; the phone bar's controls are 36px; `TransactionFeed`/`CompactExpenseRow` carry two pre-existing `react-hooks` errors; a custom range has no previous period; the month-end projection exists only in the current month; `components/dashboard/overview/NarrativeText.tsx` is an unused re-export (knip). The hero's KPIs print the PERIOD's totals (calendar included) beside a delta measured on the lived window («↓ 70,1% vs 1–14 ago» under a whole-month 1953 €) — the verdict's second sentence is what reconciles the two, by design. The Movimenti reading still sums scheduled spending and income into one figure («7 in calendario (3753 €)»). The `describePeriodCashflow` reading and `expenseEntityStats` keep their own windows (§ *Two conventions now coexist on purpose*, above in this guide — the citation pointed at an `AGENTS.md` section that left it with the 2026-09-06 scorporo).
