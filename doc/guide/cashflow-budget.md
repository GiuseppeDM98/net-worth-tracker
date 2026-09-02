# Cashflow › Budget

> **When to open this guide** — you are editing `components/cashflow/BudgetTab.tsx`, `components/cashflow/budget/*`,
> `lib/utils/{budgetUtils,budgetSummary,budgetNarrative}.ts`, or `lib/hooks/useBudgetConfig.ts` (the ceiling, the
> per-category budgets, the projection, the historicised ceiling). In `AGENTS.md` only the short stub remains; the
> full rule is here. Modules and files: `CLAUDE.md` → *Key Files* → the **Cashflow › Budget** entry.

## Cashflow › Budget (`components/cashflow/BudgetTab.tsx`, `components/cashflow/budget/*`, `lib/utils/{budgetUtils,budgetSummary,budgetNarrative}.ts`, `lib/hooks/useBudgetConfig.ts`)
- **Opt-in**: `reconcileBudgetItems` only refreshes denormalized names and drops orphans, never auto-creates.
  `BudgetItem` fields are all required, fixtures included: `amount`, `period`, `kind`, `order`.
- **Period semantics** (`getPeriodActual`): monthly = current-month spend, annual = year-to-date, and annual budgets never
  enter `validateBudgetAllocation`. The **overall** budget is a ceiling on ALL month spending, while the validator sums
  only monthly expense *category* budgets. **Auto-save is paused while the allocation is invalid**, and the status
  («Salvato» / «Oltre il tetto: non salvato») is the Per categoria tile's aside (`role="status"`), not a bar of its own.
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
- **Every number is born in `lib/utils/budgetSummary.ts`** (`summarizeCeiling`, `summarizeIncomeTargets`,
  `summarizeAnnualBudgets`, `buildCategoryRows`, `buildSpendingHistory`, `summarizeAlerts`), every sentence in
  `budgetNarrative.ts` (`buildBudgetVerdict` and the `describe*` readings; the settings' copy too —
  `describeCeilingSetting`, `ALERTS_SETTING_*`, `CEILING_SETTING_*`). Articles follow the printed figure
  (`articleForPercent`, `atThePercent` — «al 71%», «all'8%», «allo 0%»), and the gap in the verdict is measured on
  the projection AS PRINTED (3494,5 € prints 3495 €, so the gap is 505 €, not 506).
- **The calendar mark is the reading** (`BudgetTrack`): every expense track carries today's share of its window
  (month or year) as a 1px mark; an income target carries none. Fill colour is the budget's, not the sign's
  (`budgetProgressStyle.ts`: `--foreground` under the limit, `--warning-foreground` from 90%, `--destructive` over;
  income `--positive` only once reached).
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
- **Two-click delete without a timer** (`useArmedDelete` in `PerCategoriaTile`): pointerdown outside, Escape or blur
  disarm; the hook takes the button's ref as an argument — returning the ref inside an object trips
  `react-hooks/refs` on every read of that object.
- **GOTCHA**: never reconcile items against `categories` while `categories.length === 0` (they load async) — every
  category budget is dropped as an orphan and a later edit can persist the empty set.

## Per-page blind spots

- **Budget**: `BudgetItemDialog` stays for create/edit (no inline editing); **the ceiling history starts with the first cron run after the deploy** (earlier months read against today's ceiling, «prima quello attuale»), a month's record is its LAST captured configuration; the crossing day comes from the EXPENSE DATES (a backdated row moves it), an annual budget has no crossing sentence; a budget with every threshold off and already exceeded shows only in Per categoria; `app/dashboard/cashflow/page.tsx` carries two pre-existing `react-hooks` findings.
