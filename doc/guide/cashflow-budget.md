# Cashflow › Budget

> **When to open this guide** — you are editing `components/cashflow/BudgetTab.tsx`, `components/cashflow/budget/*`,
> `lib/utils/{budgetUtils,budgetSummary,budgetNarrative}.ts`, or `lib/hooks/useBudgetConfig.ts` (the ceiling, the
> per-category budgets, the projection, the historicised ceiling). In `AGENTS.md` only the short stub remains; the
> full rule is here. Modules and files: § *Files* below.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Cashflow › Budget**: Budget `components/cashflow/BudgetTab.tsx` + `components/cashflow/budget/*` (`BudgetTrack`, `BudgetDeleteButton`, `BudgetItemDialog`), pure `lib/utils/{budgetSummary,budgetNarrative,budgetUtils,budgetHistory}.ts`, specs `e2e/cashflow.budget{,.mobile}.spec.ts`, `lib/hooks/{useBudgetConfig,useBudgetHistory}.ts`, `lib/server/budgetHistoryService.ts` (cron phase 8), collections `budgets/{userId}`, `budgetHistory/{userId}/months/{YYYY-MM}`
- **Suites to run after a change here — Cashflow › Budget** (moved from `AGENTS.md` § Commands on 2026-09-30): `budgetUtils`, `budgetSummary`, `budgetNarrative` (with `describeBudgetClosedAnswers`, the landscape index), `tabletComposition` (+ `patrimonioNarrative` for the articles, `weeklyBudgetEmailService`, `monthlyEmailService`)

## Cashflow › Budget (`components/cashflow/BudgetTab.tsx`, `components/cashflow/budget/*`, `lib/utils/{budgetUtils,budgetSummary,budgetNarrative}.ts`, `lib/hooks/useBudgetConfig.ts`)
- **Opt-in**: `reconcileBudgetItems` only refreshes denormalized names and drops orphans, never auto-creates.
  `BudgetItem` fields are all required, fixtures included: `amount`, `period`, `kind`, `order`.
- **Period semantics** (`getPeriodActual`): monthly = current-month spend, annual = year-to-date, and annual budgets never
  enter `validateBudgetAllocation`. The **overall** budget is a ceiling on ALL month spending, while the validator sums
  only monthly expense *category* budgets. **Auto-save is paused while the allocation is invalid**, and the status
  («Salvato» / «Oltre il tetto: non salvato») is the Per categoria tile's aside (`role="status"`), not a bar of its own.
- **The tab reads its own window** (2026-09-30, `budgetWindow` in `lib/utils/expenseWindows.ts`; doc/guide/cashflow.md
  § Expenses by window): from the older of January and the first of the six trailing months, to DECEMBER — the annual
  budgets sum the Italian year whole, the rows already in the calendar included, and from January to May the six bars
  reach into last year (in March the window starts in October; `BUDGET_HISTORY_MONTHS` is the one constant behind
  `trailingMonthKeys` and the window). The tab calls `useExpensesInRange` itself, with its own clock, and gates on it
  beside the page's categories. **The dialog's suggested amount reads years of its own**
  (`budgetSuggestionWindow`: `getDefaultAmount` wants WHOLE years from the floor to last year — the months of last
  year the tab's window holds in spring would read as a year's total): `BudgetItemDialog` reads them from the moment
  it opens for a new budget and fills the empty amount when they are in, a beat after the category is picked at
  most; a later pick drops an earlier answer, and an edit reads nothing.
- **NO period axis.** A budget is always read on the current Italian month (`now` once per mount); the annual budgets
  are year-to-date and get their own tile whose aside names the window («2026, da gennaio · anno al 64%») — the
  Off-Axis Tile Rule — never a row in the monthly list.
- **ONE projection rule, the app's.** `buildSpendingForecast(split, amount, now, pace)` takes the month's spending
  SPLIT at today (`splitMonthlyTotalExpenses` / `splitMonthActualForItem`): the pace runs on what is booked to date
  and the scheduled rows are added as they are (`lib/utils/spendingProjection.ts`, which `overviewNarrative` re-exports
  for the Panoramica and Tracciamento). The 2026-08-23 redesign retired the blended model (last year's monthly average
  weighted in early in the month, `getOverallMonthlyBaseline`): three tabs printed two month-end figures for the same
  spending. `MIN_FORECAST_DAYS` (4) stays — before it `canForecast` is false, the verdict drops its pace clause, the
  hero's KPI prints «—», and nothing is «a rischio».
- **A FIXED category never follows the pace** (`resolveItemPace`: a `type`-scope item's own type, a category item's
  live category type, `fixed`/`debt` → `'fixed'`, unknown → `'variable'`): rent paid on the 1st, extrapolated by the
  day, reads «a rischio» all month. A fixed item's «Fine mese» is what is booked (no tilde) and the row carries a
  «fissa» chip. Every server caller passes categories (`weeklyBudgetEmailService` loads `expenseCategories` as
  `CategoryTypeRef[]`); the monthly email evaluates at month end, where pace is irrelevant.
- **Risk vs fact** (`rankCategoriesAtRisk` / `evaluateBudgetAlerts` + `summarizeAlerts`): «Categorie a rischio» lists
  monthly budgets whose projection exceeds their amount AND that are not over yet; a budget already over is a fact for
  «Avvisi» («Superato»). The evaluator still emits forecast-only alerts for the email, flagged `thresholdCrossed: false`;
  the tile filters them out and its footer counts them. No row in two tiles (DESIGN.md → The Risk-vs-Fact Rule).
  **A threshold is a fact of what is BOOKED, read against its own calendar** (2026-09-14): `BudgetAlert.spent` is the
  spend up to today (`splitMonthActualForItem` / `splitYearActualForItem`, the ceiling on `split.spentToDate`), so a
  mortgage dated the 27th crosses nothing on the 14th; every alert carries `period`, `calendarPct` (the month's or the
  year's elapsed share, `yearElapsedPctAt`) and `aheadOfCalendar` (judged on the printed integers), and the tile paints
  `text-warning-foreground` only on the rows that are ahead — «Tecnologia 54% · soglia 50% · anno al 70%» is muted.
  `describeAlertRowCaption` is the row's second line: the threshold against the window while under, the day (monthly)
  or «da gennaio» (annual) once over. The aside says «soglie di quota»: they are not thresholds of pace.
- **«Speso» is the booked part, «in calendario» its own clause** (DESIGN.md → The Scheduled-Is-Not-Spent Rule,
  2026-09-14): `CeilingSummary.spent` still includes the scheduled rows — the ratios, `remaining`, `exceeded` and the
  fill colour read it — but no sentence prints it as spending. The verdict names both sides («hai speso 656 € e hai altri
  1297 € già in calendario (1953 € su 3000 €, il 65% del tetto)»), the hero prints `spentToDate` with «+ 1297 € in
  calendario» beside it, `describeCeiling` compares `spentToDatePct` with the calendar and closes with «con le spese in
  calendario sei al 65%», `describeRemainingCaption` says «tolte le spese in calendario». With `scheduled === 0` every
  sentence is the old one with «speso» in place of «usato».
- **Every number is born in `lib/utils/budgetSummary.ts`** (`summarizeCeiling`, `summarizeIncomeTargets`,
  `summarizeAnnualBudgets`, `buildCategoryRows`, `buildSpendingHistory`, `summarizeAlerts`), every sentence in
  `budgetNarrative.ts` (`buildBudgetVerdict` and the `describe*` readings; the settings' copy too —
  `describeCeilingSetting`, `ALERTS_SETTING_*`, `CEILING_SETTING_*`). Articles follow the printed figure
  (`articleForPercent`, `atThePercent` — «al 71%», «all'8%», «allo 0%»), and the gap in the verdict is measured on
  the projection AS PRINTED (3494,5 € prints 3495 €, so the gap is 505 €, not 506).
- **The calendar mark is the reading** (`BudgetTrack`): every expense track carries today's share of its window
  (month or year) as a 1px mark; an income target carries none. Fill colour is the budget's, not the sign's
  (`budgetProgressStyle.ts`: `--foreground` under the limit, `--warning-foreground` from 90%, `--destructive` over;
  income `--positive` only once reached). The ceiling's track takes a second fill (`scheduledRatio`, same colour at
  40%) for the rows still to come, and every track speaks its real share through `valueText` → `aria-valuetext`
  («231%, oltre di 1963 €»): `aria-valuenow` clamps at 100 and used to announce an exceeded budget as full.
- **Settings live below the grid** (`BudgetImpostazioni`, a Radix `Collapsible` open only while no ceiling is set);
  the phone's 44px shortcut under the verdict scrolls to `#budget-impostazioni`. Without a ceiling the hero's cell is a
  hidden spacer, never a faked tile, and the verdict passes the question to the category budgets.
- **The page-level action talks through a window event** (`cashflow:add-budget`, desktop-only in the header, like
  Tracciamento's and Dividendi's); on a phone the «Aggiungi budget» button under the verdict is the only add
  affordance of the tab: the bottom-nav «+» FAB belongs to Tracciamento alone (`AddExpenseFab` in
  `BottomNavigation` reads `?tab=` through `useSearchParams` inside its own `Suspense`; absent = Tracciamento).
- **The crossing day is a fact of the EXPENSE DATES, never a cron's memory.** `findCrossingDay(entries, limit)`
  sums the month's rows by Italian calendar day and names the first day the running total goes PAST the limit;
  `projectCrossingDay` walks the pace from tomorrow with the scheduled rows landing on their own day. A row dated
  after today can put the crossing in the future — the verdict then says «Lo superi il 28 con le spese già in
  calendario», headline «supererai» — and a backdated row moves it retroactively. Both feed `CeilingSummary`
  (`crossedOn`, `projectedCrossingDay`, `overBy`, `dailyPace`, `sustainablePace`) and `BudgetAlert.crossedOn`
  (monthly items and the ceiling; annual budgets cross on a date of the year, a sentence not told yet). The day's
  article is data (`dayRef`: «il 13», «l'8», «l'11», «il 1°», «dall'8»). The Tetto tile's second and third KPIs
  have TWO faces on `exceeded`: «Restano / Al giorno (per restare nel tetto)» becomes «Oltre (dal 22) / Al giorno
  = real pace (spesi al giorno · il tetto ne regge 65)» — «0 € al giorno» told nothing.
- **The ceiling IS historicised, by the cron, one document per month.** Phase 8 of `/api/cron/monthly-snapshot`
  (`captureBudgetHistory`) copies every `budgets/{uid}` into `budgetHistory/{uid}/months/{YYYY-MM}` every day
  (merge), so a month's record is its LAST captured configuration. The client never writes it (rule `allow write:
  if false`; read by `canAccess(userId)` — nested under the uid so a missing month reads `null`, not a permission
  error). `useBudgetHistory(ownerId, trailingMonthKeys(now, 6))` does six `getDoc`s by id (no composite index) and
  `buildSpendingHistory(…, records)` gives each month ITS ceiling through `resolveMonthCeilings`: the month's own
  when recorded, today's otherwise, with `ceilingSource` so `describeHistory` can say «il loro tetto» / «il tetto
  attuale» / «il tetto (il loro da lug, prima quello attuale)». The chart draws one dashed segment per month at its
  ceiling — a step where it changed. Months before the first capture read against today's, and the caption says so.
- **Two-click delete without a timer** (`useArmedDelete` inside `BudgetDeleteButton`, used by `PerCategoriaTile`'s
  table and phone rows and by `AnnualiTile`): pointerdown outside, Escape or blur disarm; the hook takes the button's
  ref as an argument — returning the ref inside an object trips `react-hooks/refs` on every read of that object. The
  armed button reads «Conferma» in words at every width (a desktop row used to change only the icon's tint), the ROW
  prints `describeBudgetDeleteConsequence` («Eliminando, il budget di Cibo sparisce; le spese restano.») — under the
  label in the table, in the expanded panel on a phone, in place of «restano …» in the annual row — and each tile has
  ONE `sr-only role="status"` that says «Premi di nuovo per eliminare …» / «Eliminazione annullata». The pencil hides
  while its row is armed, so an armed row has one action.
- **The dialog speaks through its reading line** (`BudgetItemDialog`, dialog.md → The Status-Is-The-Reading Rule):
  idle it says what the form wants (`describeBudgetItemCopy`: kind, period, edit), the submit is never `disabled`, and a
  refusal lands in the reading in Italian — `describeFormRefusal` for the missing fields («Mancano 2 campi: Categoria e
  Importo.»), `describeBudgetDuplicateRefusal`, `describeBudgetAmountRefusal` («L'importo supera i 2330 € disponibili
  sotto il tetto.») — with `aria-invalid` on the field and the focus on it; any edit clears it. The two choices are
  `RadioChoice`, a radio group with ONE tab stop (roving `tabIndex`, arrows move). The dialog is mounted only while
  open, so `BudgetTab` remembers the opener (`openerRef`) and gives it the focus back on close.
- **A row «Fuori dal budget» is Budget's business in no figure, and everyone else's in every figure** (owner,
  2026-10-17; `Expense.excludeFromBudget`, the form's checkbox for spending types, every occurrence of a series or an
  instalment plan carrying it): a purchase made for someone else and refunded later — the refund is income the
  ceiling never sees, so the purchase must not weigh on it. ONE gate, `countsTowardBudget` (`budgetUtils.ts`; a
  transfer fails it too): the ceiling, the per-category and annual items, `splitMonthlyTotalExpenses`, the dated rows
  of the crossing day, `getPeriodExpensesForItem` (the weekly email's overspend list) and `evaluateBudgetAlerts` (the
  monthly email) all read it — the two server readers spread the document, so the flag reaches them. Tracciamento,
  Analisi, Panoramica, Storico and FIRE keep the row (the refund compensates it there). The feed and the table print
  a «fuori budget» chip, the detail a «Budget» line; the words are `EXPENSE_BUDGET_EXCLUSION_*` in
  `dialogNarrative.ts`. Pinned by `__tests__/budgetUtils.test.ts` (seen red with the gate reading `type` alone).
- **GOTCHA**: never reconcile items against `categories` while `categories.length === 0` (they load async) — every
  category budget is dropped as an orphan and a later edit can persist the empty set.

## Composizione mobile

Composed on 2026-10-12 (PR #454; its spec, retired the same day, is in `git log -- doc/mobile/`; the primitives in doc/guide/hall-of-fame.md § Composizione mobile): below `desktop:` one sequence, the desktop DOM — the `order-1…5` of the phone went that day (DESIGN.md → The First-Screen Rule). No axis. Not reached, and declared: the spec's «≤ 5 figures outside the verdict» at 390 — the fixture measures 9, the two cells and seven of the open Tetto above the pill (doc/guide/prima-schermata-misure.md § Il fixture). The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this tab does with them.

- **THE tile**: it follows the account — Tetto del mese (`bud-tetto`) with a ceiling; Categorie a rischio (`bud-rischio`) without one; Per categoria (`bud-categorie`) with no budget at all — then Rischio and Avvisi are `max-desktop:hidden` (they would say «nessun budget» under Per categoria's own empty state), there are no rows and no `PageRest`, the desktop unchanged.
- **The strip** (`selectBudgetStrip(ceiling)`, `lib/utils/budgetSummary.ts`; The Risk-vs-Fact Rule in the strip, the owner's choice of 2026-10-10): «Fine mese» (`approx-currency`, the projection; `null` «dal quarto giorno» before the 5th; negative tone when the rounded projection passes the ceiling) opens `bud-rischio`; beside it the FACT — «Restano» under the ceiling → `bud-categorie`; «Oltre» once crossed (`crossedOn` on or before today) → `bud-avvisi`; «Supererai» when the calendar crosses it on a day still ahead → the verdict, which names the day (`VERDICT_REST_SECTION`; the tab puts the focus on `#bud-verdetto`, since 2026-10-12). None without a ceiling. The verdict is ONE sentence, never cut (the owner's choice, 2026-10-10).
- **Lifted blocks**: the Tetto's KPIs — `fine-mese`, `restano`, `oltre` (`TettoTile.liftedFigures`, `isTettoLiftedBlock`): hidden below `desktop:` (the tablet included since 2026-10-16), whole at 1440. On the fixture «Fine mese» ran under «Oltre» at 390 until that day (seen by the census on 2026-10-10): the lift is what removes the two figures from the width where they overlapped (`e2e/mobile-composition.cashflow.mobile.spec.ts` holds the two KPIs hidden at 390, seen red with the lift ignored); each KPI is also a `@container` whose figure shrinks to its cell (`@max-[120px]:text-[18px] @max-[104px]:text-[16px]`) — a guard, not the fix: from 768 the Tetto spans the grid and a cell is ~230px, so no figure of the fixture can run under its neighbour there, and the shrink is kept for a THE tile narrower than any layout draws today (the landscape stage's left column is 560px at 1024×768, 2026-10-16). The spec holds the cells' `container-type` and the three boxes apart at 768 (seen red with `@container` removed).
- **The rows and their aside, in DOM order** (ids `BUDGET_SECTION_IDS`; `resolveBudgetSections({ hasCeiling, hasItems, hasAnnual })`, memoized on the three flags — which tiles are rows depends on the account): `bud-rischio` («a fine mese», a row only with a ceiling), `bud-avvisi` («soglie di quota» / «disattivati»), `bud-annuali` («da gennaio», only with an annual budget), `bud-categorie` («budget del mese») — `describeBudgetClosedAsides(alertsEnabled)`, words and never a figure (`__tests__/budgetNarrative.test.ts`). The save status is ONE stable live node, `sr-only` at every width beside the section in Per categoria's cell (so a closed row keeps it), with the visible `aria-hidden` copy in the aside where the aside renders — an engineering choice over the spec's letter (one node, visible when the row is open or at 1440 and `sr-only` when closed): a node that toggles `sr-only` would move in the layout, and a live region that changes text must never be the node that appears (doc/guide/dialog.md).
- **`binding` clauses and the `scope`**: none — `buildBudgetVerdict` (`lib/utils/budgetNarrative.ts`) sets no `leadLength`, so `splitVerdict` never cuts and no segment needs to be `binding`; the tab's `PageVerdict` passes no `scope`.
- **Absences**: loading is `TileGridSkeleton` (`BUDGET_SKELETON_CELLS`); a failed read is the whole tab's `ErrorNotice`, no verdict and no rows — no row ever carries `failed`, so `PageRest` has nothing to announce. Nothing recorded is «Nessun budget impostato.» with Per categoria alone (THE tile, above).
- **The memory**: `mobile-sections:cashflow:budget` (`useMobileSections({ route: 'cashflow', tab: 'budget' })`; per device and browser, not per account); absent or unreadable → the tab's defaults, every row closed (no `defaultOpen`). «Il perché» the row `bud-perche` (the verdict is never cut, so it never shows); `active` remounts `PageRest`. The settings' disclosure stays as it is, after the grid.
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`, `useTabletComposition` + `useTabletStage`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage; the landscape tablet's spec, retired on 2026-10-16, is in `git log -- doc/mobile/`): with a budget, at 768 two columns — THE tile on both (the Tetto, or Categorie a rischio without a ceiling, which gains its two columns), «Il resto» on a row of its own, the rows two by two, an open row and a closed one left alone whole; the first closed row ends 8px under the pill on the fixture (the budget had `true`; now `false` with a `raisedBy`, doc/guide/prima-schermata-misure.md § Registro delle voci allargate). **On a tablet in landscape** (a content box ≥ 880px below 1440: 936 at 1024×768 beside the icon rail) the tab is a STAGE: on the left the short verdict (the one sentence, the strip on one row) and THE tile under it, 16px apart, sticky while the page scrolls when the left stack fits the screen, the tile reaching the fold; on the right the 360px INDEX, ONE card with «Il resto» and the rows flat under hairlines, each opening in place. **Without any budget there is no row**: Per categoria alone on `PLAIN_GRID_CLASS` (the grid of before), its cell through `leadCellClass(hasItems)` — never the stage's left column with the right one empty; the swap of THE tile (Tetto ↔ Categorie a rischio) is followed by the stage's observer under the same stage.
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, 2026-10-16, landscape only; `describeBudgetClosedAnswers({ risk, alertRows, alertsEnabled, annual, validation, monthlyExpenseCount })` in `budgetNarrative.ts`, through `RowAnswers`; a `null` keeps the row's aside, and below landscape every row keeps it):
  - Categorie a rischio (a row only with a ceiling): «{cat} +{€ compact}» in the loss colour, the category the reading names first with its projected overrun; null with nothing evaluated, no pace yet, or nothing at risk.
  - Avvisi: the first category alert in the tile's order (the overall ceiling skipped, its overrun is the strip's «Oltre»): «{cat} superato», or «{cat} al/all'/allo {%}» (integer); null with the alerts off or none.
  - Annuali: «{budget} {%}» (integer, the loss colour once exceeded) — the one furthest ahead of the year's calendar, else the most used; null without annual budgets.
  - Per categoria: «non assegnati {€}», «tutto assegnato», «{€} di troppo» (red, unsigned); without a ceiling «{€} al mese»; null with neither a ceiling nor a monthly budget.
- **The specs**: `e2e/mobile-composition.cashflow.mobile.spec.ts` (a ceiling of 1000 € planted through the emulator's REST API on the base account, which has none: «Fine mese» → Rischio, «Oltre» → Avvisi, a row remembered across Tracciamento and a reload — two cold loads, so that test takes 120 s —, the KPIs at 390 and 768), `e2e/cashflow.budget.mobile.spec.ts` (the 44px targets, on the account without a budget: it reads the settings disclosure, outside the grid, so the composition did not touch it), `e2e/cashflow.budget.spec.ts` (1440; it reads «Salvato» from the cell's live node by its exact text, no longer inside the region — the two tests went red on 2026-10-12 with the locator of before). Not proven in a browser: «Supererai» putting the focus on `#bud-verdetto` (the fixture is always crossed already, so «Oltre»; Vitest holds the cell's target), and «Fine mese» as `null` before the 5th (Vitest, `__tests__/budgetSummary.test.ts`).

## Per-page blind spots

- **Without a budget the phone shows Per categoria alone** (2026-10-12): Categorie a rischio and Avvisi are hidden below `desktop:` (they would repeat its empty state), so the first budget is added from that tile or the settings under it. The base fixture has no ceiling: its Budget has no strip, and the census's `firstClosedRowAbovePill` for this tab is read without one.
- **The fee of a row «fuori dal budget» stays IN the budget** (2026-10-17): the flag is the row's alone, and a fee is a
  row of its own (doc/guide/cashflow.md) — a bank charge for a purchase made for someone else is still a cost of
  yours. Mark the fee row too if it should not count. The CSV import writes no flag.
- **`useBudgetConfig` derives what it used to write** (2026-09-06): `items` is a `useMemo` reconcile over the saved list
  and `saveStatus` comes from `editSeq`/`lastWrite`, so three transient readings differ from before while every write is
  identical — a write landing while a newer edit is queued shows «saving» instead of a brief «saved»; after an error a
  category refetch retries silently while the status still says «error»; and `loading` turns true again on an account
  switch. An error never retries by itself: `lastWrite` is not a dependency of the autosave.

- **Budget**: «Salvato» in the Per categoria aside fades after 4 s (`SAVED_LABEL_MS`) and comes back on the next save —
  a confirmation, not a state; the ceiling's fill colour and «Restano» still read the total INCLUDING the calendar (a
  ceiling exceeded only by a row dated the 28th is red today, and the verdict says «Lo superi il 28»); the phone's
  switch is 20px and its 44px target is the label; `BudgetItemDialog` stays for create/edit (no inline editing); **the ceiling history starts with the first cron run after the deploy** (earlier months read against today's ceiling, «prima quello attuale»), a month's record is its LAST captured configuration; the crossing day comes from the EXPENSE DATES (a backdated row moves it), an annual budget has no crossing sentence; a budget with every threshold off and already exceeded shows only in Per categoria; `components/cashflow/CashflowPageClient.tsx` carries two pre-existing `react-hooks` findings.
