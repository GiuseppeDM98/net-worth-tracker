# Centri di Costo

> **Quando aprire questa guida** — quando tocchi `components/cashflow/{CostCentersTab,CostCenterDetail,CostCenterDialog}.tsx`, `components/cashflow/cost-centers/*`, `lib/utils/{costCenterSummary,costCenterNarrative,costCenterUtils,costCenterColors,costCenterLinking}.ts` o `lib/services/costCenterService.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. Moduli e file: § *Files*, sotto. Spec: `e2e/cashflow.centri{,.mobile}.spec.ts` sull'account `test-user-centri` (`scripts/seedCostCentersE2E.mts`).

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Centri di Costo**: Centri di Costo `components/cashflow/{CostCentersTab,CostCenterDetail,CostCenterDialog}.tsx` + `cost-centers/*`, pure `lib/utils/{costCenterSummary,costCenterNarrative,costCenterUtils,costCenterColors,costCenterLinking}.ts` (`firstFreeColorKey`/`mapColorSlotUsage` = who wears which slot; `buildLinkCandidates`/`buildLinkPlan` = bulk link with its undo, UI `cost-centers/{LinkExpensesDialog,UnlinkSeriesDialog}.tsx`), `costCenterStyles.ts` (`CHART_TICK_STYLE`), specs `e2e/cashflow.centri{,.mobile}.spec.ts` on `npm run e2e:seed:centri`
- **Suites to run after a change here — Centri di costo** (moved from `AGENTS.md` § Commands on 2026-09-30): `costCenterSummary`, `costCenterNarrative` (with `describeCostCenters{,Detail}ClosedAnswers`, the landscape index), `tabletComposition` (+ `patrimonioNarrative` for the articles, `budgetNarrative` for `dayRef`), `costCenterUtils`, `costCenterColors` · **Browser** `e2e/cashflow.centri{,.mobile}.spec.ts` (own account, `npm run e2e:seed:centri`)

## Centri di Costo (`CostCentersTab`, `CostCenterDetail`, `components/cashflow/cost-centers/*`, `lib/utils/{costCenterSummary,costCenterNarrative,costCenterUtils,costCenterColors}.ts`)
- **NO period axis, by decision (2026-08-23).** A project's cost is its whole cost: every figure is lifetime («in
  totale») unless it names its window — `ytd`, `lastYear`, `trailingTotal`/`trailingAverage` (12 months), the
  ceiling's own `period`, `monthScheduled`/`yearScheduled`. The old `Mese|Anno|12 mesi|Sempre` picker,
  `filterExpensesByPeriod`, `computePeriodComparison` («vs precedente» has no honest predecessor without an axis),
  `projectAnnualCost`, `buildMonthlySeriesByCategory`, `buildComparisonSeries` and `CostCenterPeriod` are gone.
  Generalise: *a page whose question has no axis reads everything whole and lets each off-window tile name its
  window* (DESIGN.md → The Whole-Cost Corollary).
- **«In totale» is what is dated up to `now`.** `summarizeCenter` splits the rows at today: `total`/`count` are
  the booked ones, `scheduled` the rest (a materialised instalment, a recurring row). The scheduled rows are
  listed in Movimenti with an «in calendario» chip, counted in the aside («8 voci»), added as they are to a
  window's end and to a ceiling's `spent` («impegnato» instead of «speso» in the copy), and never summed into the
  cost. A backdated row moves the total AND the crossing day retroactively.
- **A CENTER HAS NO PACE (2026-09-18, the owner's call).** A window's end is what is booked plus what is already
  in the calendar — `ytd` + `yearScheduled`, `monthSpentToDate` + `monthScheduled` — and nothing else: no
  `projectWindowEndWithScheduled`, no «al ritmo attuale», no «~» (it is a sum). Two reasons, both
  seen on real data (the figures here are illustrative): a recurring series is N REAL future rows, so its future already sits in `scheduled` and
  pacing its booked part counted it twice (100 €/month of insurance read ~1300 € at year end instead of 1200); and
  a project spends in blocks — a 1500 € repair on the 15th read «~3000 € a fine mese». Budget KEEPS its pace (a
  category of groceries is smooth; a project is not): do not «unify» the two. The cells are «Questo mese» /
  «Quest'anno» — the figure is what is BOOKED in the window, the caption adds the calendar («con il calendario
  chiude a 1100 €, 100 € oltre») or says «speso finora»; the verdict of a center without a ceiling adds «con
  le spese in calendario l'anno chiude a X» only when something is scheduled. `resolveYearCalendar` keeps
  `dayOfYear` from calendar fields in UTC (the DST trap) for the annual ceiling's mark.
- **A monthly ceiling reads the month through Budget's `summarizeCeiling`** (same `spent`, same crossing day,
  same today's mark — the two tracks never disagree on what was spent), but the RISK is the center's own.
- **Risk vs fact stand on the CALENDAR**: `exceeded` = what is booked is past the ceiling (`spentToDate >
  amount`, the fact); `atRisk` = still under on what is booked, past it once the scheduled rows land (`spent >
  amount`) — «supererà il tetto», «Lo superi il 28 con le spese già in calendario» on a month (`crossedOn`
  after today), without a day on a year (no crossing day there). Budget's own `exceeded` counts the scheduled
  rows too: `summarizeMonthlyBudget` re-derives it, do not pass Budget's through. The list verdict ranks `over`
  (negative) > `atRisk` (warning) > the most expensive center (neutral); two or more are counted («2 centri
  supereranno il tetto.»). The dormant clause closes every sentence; a never-used center reads «non ha ancora
  spese», never «fermo da N giorni» (`idleDays` is null). **The detail ranks archived > never used > over >
  RISK > dormant > holding > no ceiling**: the risk outranks dormancy because it no longer needs a live pace —
  an idle center with an instalment to come is exactly the one the LIST names, and the detail answered «è
  fermo da 246 giorni» to it until the page's first spec found the two disagreeing. «Costa 124 € al mese» =
  `averageMonthly` = total / calendar months since the first expense.
- **The open center lives in the URL** (`?tab=cost-centers&center=<id>`, PUSHED by `openCenter`; `replace` only
  after a delete, so Back never lands on a center that is gone). `selectedCenter` is derived from `centers`, so a
  saved edit or an archive reaches the detail with the refetch and an unknown id falls back to the list. The
  detail LANDS like a page — `main` scrolled to 0 (`main` is the scroller, and on a phone the row sits below
  the fold: the detail used to mount 530px down its own length) and the focus on the back link; coming back,
  the list finds the opener by `data-center-row` and focuses it (the first match in DOM order: a center sits
  in Centri AND in Dormienti when idle).
- **A new center opens on a FREE colour**: `firstFreeColorKey(centers)` (`costCenterColors.ts`) = the first slot
  no ACTIVE center holds (an archived one frees its slot; with all eight taken, the least crowded). Every center
  used to be born `chart-1`. `mapColorSlotUsage` names who wears each slot: a worn swatch carries a hole (the
  surface showing through — legible on every theme) and its accessible name says «in uso da …»; choosing one is
  allowed and the reserved line under the picker says what it costs. **Existing documents are never re-coloured**
  (the owner's call: a saved colour is a choice, and an untouched default cannot be told from one).
- **The dialog's reading is its status line** (`describeCostCenterDialogCopy` + `describeModalStatus`): the submit
  stays enabled, an empty name or a typed ceiling that is not a positive amount is refused THERE
  (`describeFormRefusal`, focus on the field), a failed write is `describeWriteError` there, never a toast. A
  NEW center's idle reading teaches the feature's entry point — the expense form's «Centro di Costo» field under
  «Impostazioni avanzate» (`LINK_FIELD`, said once in the narrative and reused by the empty verdicts and the
  empty Centri tile). The ceiling's hint promises NO notification: nothing sends one.
- **A center is filled AND corrected from its detail** (2026-09-18). «Collega spese…» (`LinkExpensesDialog`, `lg`)
  links many expenses in ONE confirm; a row of «Movimenti collegati» opens its expense in `ExpenseDialog` (the form
  Tracciamento uses, with its own reconciliation and invalidations) and «Scollega» takes it out of the center in
  place (`useArmedDelete`, the consequence in the row, ONE live region for the tile); a row of a series asks «solo
  questa o tutta la serie?» (`UnlinkSeriesDialog` — a choice is a modal, doc/guide/dialog.md). The pure half is
  `lib/utils/costCenterLinking.ts`, and it owns four rules:
  - **A candidate is what the center will SHOW once linked**: spending by `type` (never an income, never a transfer)
    AND `amount < 0`, because the tab and the detail keep `amount < 0`. A refund is spending by type with a positive
    amount: offered, it would be linked and then appear nowhere on the page.
  - **A series is ONE candidate** (`series:<parentId>`, every occurrence not yet on the target, the ones to come
    included — «3 rate · 2 in calendario»). A center reads its future from the calendar: linking only the rows
    already paid would leave «con il calendario chiude a …» blind to the rest of the plan.
  - **An expense has ONE center, so linking a row of another center MOVES it**: those rows are hidden until
    «Mostra anche quelle di altri centri», carry «di {centro}», and the reading — which is the status line —
    says «3 passano da Vacanze a Auto Tapiro» BEFORE the confirm. The summary runs over ALL the candidates, not
    the filtered ones: a tick survives a change of filter, and the confirm must never write more than it announced.
  - **Every write is a two-sided plan** (`buildLinkPlan` / `buildUnlinkPlan` → `writes` + `undo`, each row exactly
    as it was, its previous center included), so the outcome toast's «Annulla» is a second write, not a guess.
  The service is `assignExpensesToCostCenter`: BOTH fields always (`costCenterName` is denormalised on the row — an
  id without its name prints a blank chip in Tracciamento), chunks of 400 committed IN ORDER, and the caller
  refetches in a `finally` (past one batch a run can stop half-way). Only `costCenters.all` and `expenses.all` are
  invalidated: no amount moves, so no balance, snapshot or overview is stale.
- **`getExpensesForCostCenter` returns `Date`s** (2026-09-18): it used to hand out raw Firestore Timestamps, which the
  page never noticed (every date goes through `toDate()`) and `ExpenseDialog` does — opened from a center's row it
  threw «Invalid time value» on its date field. Pinned by `e2e/cashflow.centri.spec.ts` (the date input's value).
- **The list's readings do not repeat each other**: the verdict says who weighs what, Centri how concentrated
  the list is, and Totale reads TIME (`describeTotale(summary, stack, now)`: since when, this year's share, the
  tallest of the twelve bars — «Settembre, ancora in corso, è già il mese più caro degli ultimi 12»). «Anno
  scorso» is captioned «2025, da settembre» when the history BEGAN in it (`describeLastYearCaption`): four
  months read as a whole year beside «Quest'anno» printed a false ×21. A center born this year drops «quest'anno
  X, il 100%» from its verdict and its Costo reading.
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
- **The tab reads the WHOLE expense collection, declared** (2026-09-30): a centre is lifetime, so there is no window
  to read — while Tracciamento, Divisione and Budget, the other Cashflow tabs, read one
  (doc/guide/cashflow.md § Expenses by window). It shares the `useExpenses` list with Storico and Analisi; opened after
  Tracciamento alone it reads the collection itself. **A delete and a rename are writes of EXPENSES** — the delete
  unlinks the centre's rows, the rename rewrites their denormalised `costCenterName` — and until that day they
  invalidated `costCenters.all` only, so Tracciamento kept the chip of a centre that was gone: `CostCentersTab` now
  invalidates `expenses.all` with it (`invalidateWithRows`), as the detail's link changes always did.
- **The rows per center come from the ONE expenses key, grouped in memory** (2026-09-29):
  `groupExpensesByCostCenter(allExpenses, centers)` in `costCenterUtils.ts` gives every center TWO numbers,
  `spending` (the rows with `amount < 0`, date ascending like the per-center query it replaced) and `linkedCount`
  (every linked row, income included); a center without rows gets an EMPTY entry, a row naming a center the list
  does not hold lands in none (pinned, seen red). Until then the tab ran one Firestore query per center (N+1) on
  rows already in `useExpenses`, and the detail a query of its own — the detail now receives its rows from the
  list and has no skeleton or error of its own (the list gated on the two keys, `useCostCenters` + `useExpenses`).
  `deleteCostCenter` unlinks *whatever is linked*, income included, by writing `costCenterId: null` (never deleting
  the row) — **any count next to a destructive action must come from the same read the mutation runs**, and
  `linkedCount` is that read. The delete is the app's one
  mechanism, `useArmedDelete` (the view kept a hand-written copy until 2026-09-18): the armed button is an
  outline «Conferma» with `aria-pressed`, the consequence prints UNDER the action cluster in `text-destructive`
  on a line reserved from `desktop:` (arming used to push the grid down 20px), arm and disarm are both
  sentences for the live region (emptying one announces nothing).
- **Session-only lenses are stored WITH their subject** (`{ id, keys }` for the subcategory exclusions,
  `{ id, count }` for the movements window): a stale id falls back to the default with no effect and no extra
  render (`react-hooks/set-state-in-effect`). The exclusion touches only the Per sottocategoria tile; a row is a toggle whose PRESSED state
  means «counts in the total» (`aria-pressed={!excluded}`, the constant prefix «Conta nel totale:» in its
  name) — it was the other way round, so a screen reader heard «premuto» on the rows taken out.
- **Rows that open a center are `<button>`s whose accessible name is their content** («Apri Fenicottero …»):
  a center sits in Centri AND in Dormienti when idle, so a spec scopes the locator to the tile
  (`getByRole('region', { name: 'Centri', exact: true })`) or `.first()` trips strict mode.

## Composizione mobile

Composed on 2026-10-12 (PR #454; its spec, retired the same day, is in `git log -- doc/mobile/`; the primitives in doc/guide/hall-of-fame.md § Composizione mobile): the list and the detail are each one sequence, the desktop DOM (the `order-*` of both went that day — DESIGN.md → The First-Screen Rule). The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this page does with them. Not reached, and declared: the spec's «≤ 1,5 screens» at 390 — the fixture measures 1,55 (doc/guide/prima-schermata-misure.md § Il fixture).

- **THE tile**: Totale (`cdc-totale`) on the list, Costo (`cdc-centro-costo`) on the detail — open at every width (DESIGN.md → The First-Screen Rule), their charts as they are.
- **The strip**: none (the owner's choice, 2026-10-10): Totale's three figures each name their own window and none is the verdict's; the verdict is whole, no cut, no axis.
- **Lifted blocks**: none — with no strip no cell repeats a figure, so neither Totale nor Costo takes `liftedFigures`.
- **The rows and their aside, in DOM order** (`COST_CENTERS_SECTIONS`, `DETAIL_SECTIONS` / `DETAIL_SECTIONS_WITHOUT_CATEGORIES`, module-level; ids `COST_CENTER_SECTION_IDS`, the words in `lib/utils/costCenterNarrative.ts`): the list's `cdc-centri` («in ordine di costo») and `cdc-dormienti` («senza spese da tempo»); the detail's `cdc-centro-categorie` («in totale», not rendered when one category is the hero said again), `cdc-centro-ciclo` (its own aside, «attivo» / «fermo» / «archiviato» from `describeCicloAside`, open or closed), `cdc-centro-sottocategorie` («in totale», or `describeSottocategorieClosedAside`: «2 escluse» while a lens is set), `cdc-centro-movimenti` (`describeMovimentiAside`, the count). «Apri Fenicottero» lives inside the Centri row: a spec opens the row first.
- **`binding` clauses and the `scope`**: none on the list or the detail. A cut here would need a `binding` on «con le spese già in calendario» (The Binding-Clause Rule, `lib/utils/narrative.ts`): none exists because nothing is cut (`costCenterNarrative.ts` sets no `leadLength`), and no spec plans one; neither surface passes `PageVerdict` a `scope`.
- **Absences**: loading is `TileGridSkeleton` (`COST_CENTERS_SKELETON_CELLS`); nothing recorded (no centre) is the verdict, «Nuovo centro» (below `desktop:`) and one tile «Centri» with its `EmptyState` — no grid, no rows, no `PageRest`; a failed read is the verdict's notice (below). The detail renders only for a centre found among those read, so it has no absence of its own.
- **A failed read is the verdict's notice** (`PageVerdict.pending`, `{ kind: 'failed' }`, since 2026-10-12 in the spec's retirement): until then the verdict of the EMPTY summary («Nessun centro di costo.») stood above the `ErrorNotice` that warned the page would wrongly say exactly that. Below it nothing renders — no tile, no rows, no `PageRest`, nothing written to the memory. Not proven in a browser: a Firestore read of the client SDK cannot be failed from a spec.
- **The memory**: `mobile-sections:cashflow:cost-centers` (route `cashflow`, tab `cost-centers`: the tab is mounted once visited and kept with `forceMount`, each Cashflow tab with its own key), per device and browser, not per account; absent or unreadable → the page's defaults, every row closed (neither controller passes a `defaultOpen`).
- **Two controllers, one memory per PAGE**: `mobile-sections:cashflow:cost-centers` for the list and `…:cost-centers-center` for every centre's detail (never per centre); the verdicts' rest ids `cdc-perche` / `cdc-centro-perche`, never drawn (both verdicts are whole); `active` goes from the tab to `CostCenterDetail`, so the one `role="alert"` is the showing surface's. Back finds the list's rows as they were.
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`, `useTabletComposition` + `useTabletStage`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage; the landscape tablet's spec, retired on 2026-10-16, is in `git log -- doc/mobile/`): the list and the centre's detail alike — at 768 two columns, THE tile (Totale, Costo) on both, «Il resto» on a row of its own, the rows two by two, an open row and a closed one left alone whole. **On a tablet in landscape** (a content box ≥ 880px below 1440: 936 at 1024×768 beside the icon rail) each is a STAGE: on the left the whole verdict and THE tile under it, 16px apart, sticky while the page scrolls when the left stack fits the screen, the tile reaching the fold; on the right the 360px INDEX, ONE card with «Il resto» and the rows (two on the list, three or four on the detail) flat under hairlines, each opening in place.
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, 2026-10-16, landscape only; `describeCostCentersClosedAnswers(summary)` for the list and `describeCostCenterDetailClosedAnswers({ center, composition, subComposition, excludedKeys, netSubTotal })` for the detail, `costCenterNarrative.ts`, through `RowAnswers`; a `null` keeps the row's aside, and below landscape every row keeps it):
  - Centri: null — it keeps its scope (the first centre and its share are the verdict's; owner, 2026-10-16).
  - Dormienti: the longest-idle centre «{centre} {€ compact}» (how much lies idle, never the days), «{centre} mai usato» for one never used, «nessuno fermo» without any; null without an active centre.
  - Per categoria (detail): «{category} {%}» (`Math.round`, the «Altro» tail skipped); null with fewer than two slices.
  - Ciclo di vita (detail): «ultima spesa oggi», «ultima spesa ieri», «ultima {n} giorni fa» while active; null when dormant or archived (the aside keeps «fermo» / «archiviato»).
  - Per sottocategoria (detail): «{subcategory} {%}» (integer, of the included total); null with one slice, «Senza sottocategoria» first, any exclusion on («2 escluse» stays) or a total ≤ 0.
  - Movimenti collegati (detail): null — it keeps its count.
- **The specs**: `e2e/cashflow.centri.mobile.spec.ts` (the detail lands at the top and Back finds the Centri row still open — seen red with the list's memory key cleared before going back —, the 44px targets and no overflow — Centri and Movimenti collegati opened first); `__tests__/costCenterNarrative.test.ts` (the two `describe*ClosedAnswers`); `npm run mobile:budget` holds the surface `cashflow-centri` of `perf/mobile-budget.json`.

## Per-page blind spots

- **The detail's rows are remembered for every centre at once** (2026-10-12): a Movimenti collegati opened on one centre is open on the next, because the memory is the page's (`cost-centers-center`), not the centre's — the list keeps its own.
- **Centri di Costo**: **habitual spending typed by hand (fuel) is not foreseen** — a window's end is booked + calendar, by decision; two centers saved with the same colour before 2026-09-18 stay the same colour until one is edited (no backfill); «Per categoria» is not rendered for a center with one category (it would repeat the hero) and Ciclo di vita takes its columns; the expense form lists an archived center only on the expense already linked to it; «Collega spese…» is disabled on an archived center and offers no refund (a positive amount — see above) and no income; its list is the account's WHOLE expense history read once per open (`useExpenses`, the whole history, 50 shown at a time); «Annulla» lives as long as its toast; the list's «Media 12 mesi» and the detail's «Al mese» are two magnitudes on purpose (trailing year / 12 vs whole cost / months since the first expense); an annual ceiling has no crossing day (`crossedOn` is monthly only); «Al mese» divides by the calendar months since the first expense (an idle project reads as a lower monthly cost, by design); «in totale» counts rows dated up to today (a future row is «in calendario»); the subcategory lens and the movements window (25 + «Mostra altre») are per-center, session-only state.
