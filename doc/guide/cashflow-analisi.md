# Cashflow › Analisi

> **When to open this guide** — you are editing `components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/*`,
> or `lib/utils/{analisiSummary,analisiNarrative}.ts` (the four-mode axis, the composition tiles, the entity Scheda,
> the Sankey). In `AGENTS.md` only the short stub remains; the full rule is here. Modules and files: § *Files* below. The block names Playwright — specs `e2e/analisi.spec.ts`,
> `e2e/analisi.mobile.spec.ts` (auth setup `e2e/auth.analisi.setup.ts`) and `e2e/classifica.tablet.spec.ts` (base account, the two rings at 768 and 1024), seed `scripts/seedAnalisiE2E.mts` via
> `npm run e2e:seed:analisi` with the emulators up.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Analisi**: `components/cashflow/AnalisiTab.tsx` (`handleEntitySelect`) + `components/cashflow/analisi/*`, `components/cashflow/{EntityDossier,EntitySearch,ConfrontoAnnualeSection,CashflowSankeyChart,SavingsRateTrendSection,AndamentoStoricoSection}.tsx`, their lazy plots `components/cashflow/{ConfrontoAnnualeCharts,SavingsRateLineChart,AndamentoStoricoCharts,EntityTrendChart}.tsx` (what the page downloads: `e2e/bundle.lazy{,.mobile}.spec.ts`); pure `lib/utils/{analisiSummary,analisiNarrative,expenseGrouping,cashflowSankey,cashflowComposition,expenseCategoryMatching,comparisonDeltas,expenseEntityStats,entitySearch}.ts`
- **The Scheda's «Trend mensile»** (`components/cashflow/EntityTrendChart.tsx`): the y axis is `width="auto"` with no negative margin since 2026-11-15 (a fixed 56px under −16px cut «1200 €» to «200 €»; owner, the mirror tour of «Classifica»), held by `e2e/classifica.tablet.spec.ts`.
- **The tiles** (2026-11-12, «Classifica»): `components/cashflow/analisi/tiles/{ClassificaTile,SpeseMaggioriTile,CambiatoTile,EntrateTile,PeriodoTile,SchedaTile}.tsx` — the spending ring by type and the ranking (`buildSubCategoryRanking` for the «Sottocategorie» view), the largest rows (`TOP_EXPENSES_SHOWN` / `TOP_EXPENSES_MORE`, `limitTopExpenses`, the note as label; `RankedRows layout="stacked"` since 2026-11-15: the label beside the figures, the caption — category of a noted row · subcategory · day — beside the bar), the movers on a zero-centred track (`summarizeCategoryChanges`), the income ring (`buildRingShares`), the Periodo's three rows; RTL tests `__tests__/{classificaTile,speseMaggioriTile,cambiatoTile,entrateTile}.test.tsx`
- **The two tiles of the first row fill each other's void** (owner, 2026-11-23; 1440 only, where they share a grid row): at rest «Dove vanno i soldi» draws eight categories and «Spese maggiori» ten rows, and the shorter one is handed the rows that fit between its last row and its footer — more categories beside the ten expenses or beside the twenty of «Mostra altre», more expenses (up to the twenty it has) beside «Mostra tutte». `useBalancedRows(enabled, resetKey)` (`lib/hooks/useBalancedRows.ts`) measures the two cells in a `ResizeObserver` callback through the marks each tile carries — `data-fill-body` (+ `data-fill-extra`, `data-fill-room`), `data-fill-list`, `data-fill-foot` — and `balanceRows` (`lib/utils/rowFill.ts`) is the arithmetic: a tile's slack is its void as drawn plus the rows already added, so the answer is the same before and after the fill and nothing has to be measured at rest; only the tile shorter at rest gets rows, a tile the reader unfolded has `room` 0. One category alone behind «Altre N» takes that row; the toggle goes when nothing is left hidden; the aside and the reading of «Spese maggiori» count the rows shown («14 di 412», «Le quattordici più grandi», a word up to twenty). The residual void is under one row. Tests: `__tests__/{rowFill.test.ts,useBalancedRows.test.tsx}` and the two tiles'; no E2E — no fixture account has more than eight categories and ten expenses, the measure was read in the browser on the tour (1440 and 1920)
- **Flusso**: `components/cashflow/analisi/tiles/FlussoTile.tsx` (the view, the drill), loaded on demand as the first tile of «Dettaglio» (`components/cashflow/analisi/DettaglioDisclosure.tsx`, a `lazyComponent` in its `DETTAGLIO_LAZY_CHARTS`, preloaded at idle; since 2026-11-12); the drawing is chosen by `DettaglioDisclosure` on the Flusso's CELL width, `FLUSSO_SANKEY_MIN_CELL` = 608 through `lib/hooks/useElementWidth.ts`; in a cell from 608px the Sankey `components/cashflow/CashflowSankeyChart.tsx` on the pure builders of `lib/utils/cashflowSankey.ts` (the roles' at its end), the role colours from `lib/constants/spendingRoleColors.ts` through `lib/hooks/useCssColorTokens.ts` + pure `lib/utils/cssColorToHex.ts`; in a narrower cell (a phone) `components/cashflow/analisi/FlowShareMobile.tsx` on the shared `components/ui/composition-bar.tsx`, with its TWO callers `SpendingTypesMobileFlow.tsx` (the type view, numbers from `buildTypeFlowBreakdown` in `analisiSummary.ts`) and `SpendingRolesMobileFlow.tsx` (the roles view, numbers from `summarizeSpendingRoleShares` in `spendingRoles.ts`); the words in `analisiNarrative.ts` — `describeFlow`, `describeSpendingRolesFlow`, and for the phone `describeTypeFlowBar`, `describeSpendingRolesBar`, `describeFlowSurplus`, `describeFlowAbsence`; tests `__tests__/{cashflowSankey,spendingRoles,analisiSummary,analisiNarrative,cssColorToHex,compositionBar}.test.ts`; browser: the Flusso tests and the «50/30/20» blocks of `e2e/analisi{,.mobile}.spec.ts`, the deficit block of the mobile one
- **Suites to run after a change here — Analisi** (moved from `AGENTS.md` § Commands on 2026-09-30): `analisiSummary`, `analisiNarrative` (with `describeAnalisiClosedAnswers`, the landscape index), `tabletComposition` (+ `cashflowNarrative` for the shared readings, `patrimonioNarrative` for the articles), `expenseGrouping`, `cashflowSankey`, `cashflowComposition`, `comparisonDeltas`, `expenseEntityStats`, `entitySearch`; the tiles' RTL suites `classificaTile`, `speseMaggioriTile`, `cambiatoTile`, `entrateTile` and the Scheda's glide `smoothScroll` (2026-11-15)

## Analisi — a verdict over tiles (`components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/*`, `lib/utils/{analisiSummary,analisiNarrative}.ts`)
- **The page reads the WHOLE expense collection, by the owner's decision** (2026-09-30, when Tracciamento, Divisione,
  Budget and FIRE moved to a window of their own — doc/guide/cashflow.md § Expenses by window). Its Scheda, Confronto,
  Dettaglio and search span the history from the floor on, and the Andamento's category ranking counts the rows
  after this year too (below), so a window would have started at the floor with no upper bound and left out the rows
  dated after this year — for one more list in memory and in the persisted record, and a first opening after
  Cashflow no longer on the cache. It shares the `useExpenses` list with Storico and Centri di Costo instead.
- **ONE axis, three modes** (Anno corrente | Anno | Storico, plus a month): `PeriodMode`/`AnalisiPeriod` live in
  `analisiSummary.ts` — never import them from the component (`ConfrontoAnnualeSection` used to). The axis sits beside
  the verdict from `desktop:` and under it below; the entity search is the compact header's action. Declare
  `handlePeriodModeChange` AFTER `availableYears`, or the React Compiler refuses to preserve the page's memoization
  ("Compilation Skipped" on the first `useMemo`s).
- **Every number has one source**: `summarizePeriodCashflow` (totals), `computeTotalsPacing` + `buildCategoryComparison`
  through `resolveComparisonScope` (the pacing and the movers, against year−1), `buildExpenseComposition` /
  `buildIncomeComposition` (the category tiles, FULL lists), `rankTopExpenses`, `buildMonthlySpending` /
  `buildYearlySpending`, `summarizeFlow`, `detectSpendingAnomalies` on `resolveSingleMonth`, `computeEntityRunRate` +
  `buildEntityYearRows` for the Scheda's reading. **Every sentence** comes from `analisiNarrative.ts`
  (`buildAnalisiVerdict`, the `describe*`) or from `cashflowNarrative.ts` (`describePeriodCashflow`,
  `describeCategoryShare`), never from a component.
- **The axis has FOUR modes** (`Da inizio anno | Anno corrente | Anno | Storico`): `ytd` and `current` are not the
  same window and must never be treated as one — see doc/guide/cashflow-tracciamento.md § Cashflow › Tracciamento. `resolvePeriodThroughMonth` is the ONE
  place that says where a period stops (today's month for `ytd`, a picked month, otherwise nothing), and it feeds both
  the slice and the monthly chart. `resolvePeriodMonthCount` was deleted with the verdict's «(8 mesi)» clause.
- **The running year is NOT clipped** (2026-08-28): `periodExpenses` takes the whole calendar year and
  `resolvePeriodMonthCount` returns 12 for it, so the verdict lost its «(8 mesi)» clause and gained the shared
  `scheduledSentence` instead; the Periodo aside reads «12 mesi · 4 in calendario». The pacing is untouched — it always
  computed both sides off `allExpenses` under `sameMonths`, so it stays the one honest comparison. See
  doc/guide/cashflow-tracciamento.md § Cashflow › Tracciamento for the rule in full.
- **«Dove vanno i soldi» and «Entrate», the two rings of the page** (owner, 2026-11-12, at the reading of the
  «Classifica» composition): ONE type in the period (or one income category) draws no ring — the total stands as the
  column's hero line («spese», «entrate») above the single legend row (The Ring Rule: one part is a sentence); the
  reading is the categories' (`describeSpendingRanking`, its last clause the largest type) in BOTH views, «Categorie»
  and «Sottocategorie», so the toggle never rewrites the sentence; a «senza sottocategoria» row opens its CATEGORY's
  Scheda (a subcategory that does not exist would be empty), and two categories sharing a name across types are told
  apart in the caption («senza sottocategoria · necessarie»); the ranking's bars stay `--chart-1` and each row carries
  its type's 8×8 swatch, the key to the legend beside the ring. Held by `__tests__/classificaTile.test.tsx` (K5),
  `entrateTile.test.tsx`, `analisiSummary.test.ts` (S1b). The Periodo prints no coverage ratio since that day («per ogni
  euro speso…» left Analisi: its reading is the savings, `describePeriodoSavings`), and the verdict's builder
  `buildAnalisiVerdict` was not changed by the composition.
- **The anomalies («fuori scala») are a sentence of «Cosa è cambiato»** (2026-11-12; until then a tile of their own):
  they run on ONE month (`resolveSingleMonth`: the picked one, or today's for the bare running year), and
  `describeChangesAnomalies` names that month unless the period IS it; the verdict's clause names it too. When no month
  can be meant (a past year without a month, the history, **a picked month that has not started** — its calendar has
  no six-month average to run hot against, 2026-09-14) there is no sentence. «Cosa è cambiato» itself exists with a
  comparison (`summarizeCategoryChanges` of the Periodo's own `buildCategoryComparison` rows against
  `pacing.expenses.delta`: the six largest movers on a track centred on zero, a rise right in `--destructive`, a fall
  left in `--positive`, the movers that explain the total in the reading, new and ceased categories in the footer) or
  with the month's anomalies alone (then they are its reading); with neither it is ABSENT and Entrate and Periodo
  widen to 5 and 7 — never an empty tile with a placeholder. The anomalies are no longer an entry point to the Scheda. A Spese maggiori row dated ahead ranks (it is in the
  total) and its caption says «· in calendario» (`rankTopExpenses`' `isScheduled`, fed with `isScheduledRow`); a long
  caption wraps in `RankedRows`, never truncates.
- **The Scheda's pace is measured on the months LIVED, never a calendar total over the months lived** (2026-09-14, the P0 of the
  Impeccable critique): `computeEntityRunRate` splits `periodTotal` at `now` into `livedTotal` and the calendar ahead, and
  `periodMonthlyAverage = livedTotal / livedMonths` (12 for a closed year, today's month or the `throughMonth` cut for the running
  one, 1 for a month). A 500 € mortgage with twelve instalments materialised printed «al ritmo di 667 € al
  mese» (6000 / 9) beside «Media ultimi 12 mesi 500 €» and «Proiezione 2026 8000 €» ((6000 / 9) × 12) above a total that already
  covered the year. The projection is `livedTotal + max(calendar ahead, pace × months ahead)` — **the calendar is a FLOOR under
  the pace, never an addition to it** (adding both counted every instalment twice), and the chip is hidden when it only restates
  the period total. The Scheda's period carries the page's cut (`focusPeriod.throughMonth` from `resolvePeriodThroughMonth`): on
  «Da inizio anno» the reading said «Nel 2026 finora hai speso 6710 €» over the whole year while the row said «2026 YTD 5032 €».
  One sentence never mixes two windows: when the period total spans the calendar year and the year row's delta is same-months,
  `describeEntityFocus` names the delta's own window with its figure («; nei primi 9 mesi 5032 €, in linea con gli stessi mesi
  del 2025») — `delta.livedTotal`/`livedMonths` from the partial year row. The chips print «Media mensile · sui primi 9 mesi» and
  «Proiezione 2026 · al ritmo attuale, calendario incluso». Every aggregate of the Scheda and the Confronto is whole euros like
  the rest of the page (the hero printed «6709,68 €» under a verdict saying «6710 €»); cents stay on the transaction rows, which
  are facts, not sums; the oldest year row says «primo anno registrato», never «—». Pinned by `__tests__/expenseEntityStats.test.ts`
  and `analisiNarrative.test.ts`.
- **The history closes on the CURRENT year, calendar included** (2026-09-14): `availableYears` and the Storico's `periodExpenses`
  are capped at `today.year`, `ConfrontoAnnualeSection` (`ceilingYear`) and `cashflowTimeSeries`' builders (`BucketCeiling`) stop
  their axis there, and `computeEntityRunRate`'s all-history period too. A materialised instalment plan wrote rows into 2043, and
  the page counted them as «19 anni», drew seventeen empty years on two charts and summed them into «Dal 2025 hai speso»; the
  subject is «Dal 2025 al 2026» (`describeAnalisiSubject`), the Periodo aside «dal 2025 al 2026», and the scheduled clause has a
  horizon («a fine anno», `describeAnalisiScheduledHorizon`). A `?year=` below the floor is settled during render to the newest
  past year (the Select had no such option and the KPIs are floored while `buildMonthlySpending` drew the bars), and the
  spending series read `baseExpenses`, never `allExpenses`. Pinned by `cashflowTimeSeries.test.ts` and `analisiNarrative.test.ts`.
- **The running month is compared with the SAME DAYS of its baseline month** (2026-09-14, the owner's call, Tracciamento's rule):
  `resolveComparisonScope(mode, month, todayMonth, todayDay)` puts `throughDay` on the `singleMonth` scope and `isMonthInScope`
  cuts BOTH sides at it — the rows go in through `dayOf` (`ExpenseCalendarRef` with a `day`), and a resolver without a day cannot
  be cut (the caption then declares «(mese in corso)»). The caption is «vs Settembre 2025 (1–14 set)», the baseline «settembre
  2025 (primi 14 giorni)», the Confronto's reading «, sui primi 14 giorni», the subject «A settembre finora». On the 14th the page
  printed «A settembre spendi meno di settembre 2025.» with a green dot on fourteen days against thirty. The same cut applies to
  the Confronto's monthly bars (`mensileData`, built in the section). **An empty baseline window is SAID**: `describeMissingBaseline`
  prints «Nessun movimento nei primi 14 giorni di marzo 2025: nessun confronto.» in the Periodo where the caption would stand
  (a month recorded in one batch late in the month has nothing in its first days). **«Anno corrente» keeps its twelve-against-twelve
  delta (the Same-Basis call of 2026-08-30) and now names its cost where the red is printed**: the Periodo reading's comparison
  is «su 2025 (3 mesi ancora in calendario)» (`comparisonPhrase` in `AnalisiTab`) while the year runs. Pinned by
  `comparisonDeltas.test.ts` and `analisiNarrative.test.ts`.
- **The Flusso is legible on a real-size account or it is not a Flusso** (2026-09-14): the plot's height comes from its widest column
  (`countSankeyLayers` → `resolveSankeyHeight`: a 26px row per node, floor 500, cap 1100 — one variant, the Sankey is not drawn in a cell below 608px; a fixed
  500px packed a few dozen categories at 10px of spacing and their labels overlapped), the nodes are aligned `start` (a leaf category
  stays in the categories' column and the savings beside the types; `justify` pushed every leaf to the last column), the labels
  are one neutral per mode (`LABEL_TEXT_COLORS`, declared in DESIGN.md's hex inventory) and the svg carries the tile's reading as
  its `ariaLabel`. The subcategory layer opens only the `MAX_SUBCATEGORY_CATEGORIES` (6) largest categories with a real breakdown,
  each into its `MAX_SUBCATEGORIES` (4) largest plus ONE «Altre N» node (a `category` descriptor: it opens the category's Scheda),
  and every other category stays a LEAF with its money — the 5-layer view used to DROP a category without subcategories entirely.
  The aside says «Con sottocategorie · prime 6 categorie»; the footer says what a click does, which lived in a hover tooltip only.
  Pinned by `cashflowSankey.test.ts`.
- **Keyboard**: the axis is `SegmentedPill semantics="radio"` (a value the whole page reads) with 44px options below `desktop:` and a
  2×2 grid below `sm` (four Italian labels do not fit a 358px pill; it scrolled inside itself and clipped «Storico»); closing the
  Scheda — «Chiudi», «Indietro» at category level, or **Escape on the cell** — returns the focus to the control that opened it
  (`focusTriggerRef`, captured in `handleEntitySelect` when the opener is a control on the page), and the search's modal names its
  trigger through `returnFocusTo` and its listbox in Italian (cmdk's default was «Suggestions»). The month names of the months
  still in the calendar keep the full muted token: `opacity-60` over it measured 3,30:1 dark / 2,30:1 light. `desktop:h-7` (28px)
  is never a target here: the Scheda's exits, the Flusso's toggle and the Confronto's year select are `desktop:h-8`.
- **The Periodo tile paces against year−1 only**, with ONE caption under the KPI trio (`pacing.baselineLabel`
  verbatim); `CashflowKpiTrio` (shared with Tracciamento) prints only the arrow and the figure when `previousLabel` is
  null. Its bars draw the previous year's same month in `--muted-foreground` beside the current bar; `prevYearValue` is
  null — a gap — below the history floor OR when the previous year has no rows at all (the same refusal
  `computeTotalsPacing` makes), the running bucket is at half tone and outlined, and in Storico the series is per year.
- **The Scheda is a tile of the grid** (`SchedaTile`, 12 columns under the category tiles): every entry point lands
  through `handleEntitySelect`, which resolves labels exactly like a URL-restored focus and owns the ONE scroll
  (`scrollToScheda`, deferred a tick so the cell exists). The focus SURVIVES period changes and is exited only via
  the breadcrumb, «Indietro» or «Chiudi»; in the URL it is three FLAT params (`?focusType&focusCat&focusSub`),
  because a name-fallback key IS a name and can contain any delimiter. The category tiles keep their rows while the
  Scheda is open: `activeKey` marks the focused row `aria-current` and FORCES the list open when the row sits past
  «Mostra tutte». The series colour is derived from the kind at render (`COLORS[0]`/`COLORS[1]`), never stored.
- **`EntityDossier` keeps ignoring the axis in its multi-year blocks** (the period is a cursor over the entity's
  timeline, not a cage) and each block names its window; `columns` lays it out in two columns inside the Scheda and
  `aside` receives the period's subcategory ranking (category level) or `FocusTransactions` (subcategory level).
  Each year row expands into its per-subcategory deltas through `resolveYearRowWindows`, which is what makes
  `Σ(subcategory delta) === row.delta` true by construction — category level only. Its percentages go through
  chartService's `formatPercentage` (the Comma Rule; `toFixed` retired here on 2026-08-25).
- **`lib/utils/comparisonDeltas.ts` is the single source of the same-months rule, scope included**:
  `resolveComparisonScope` serves the Periodo pacing, the verdict and the Confronto, and returns **null for a month
  that has not started**. **Honesty rule**: `prevYearValue` is `number | null` — a baseline below the history floor is
  UNKNOWABLE, not zero, and renders as a gap. The Confronto's comparison year is the USER'S pick (the Periodo tile
  always paces against year−1): `ConfrontoDisclosure` owns that state and computes pacing, delta rows and the reading
  ONCE, then hands them to `ConfrontoAnnualeSection`, which only renders (and builds the two chart series it alone
  needs). Never recompute the rows in the section.
- **`CashflowSankeyChart` is a plot, `FlussoTile` is the navigation**: the tile owns the subcategory toggle
  (`aria-pressed`) and the single type drill, builds the `SankeyView` with the pure builders and passes it down;
  node clicks come back as DESCRIPTORS (`view.index`), never parsed from the id. Colours stay hex (react-spring).
  **A drill is stored WITH its subject** (`{ isMobile, drill }`, AGENTS.md → React Query and Derived State): it is a
  place inside the Sankey, so in a cell below 608px it resolves to none — no effect resets it — and it comes back if the
  width does.
- **The Sankey is a chunk of its own, never on a phone** (2026-09-30): `CashflowSankeyChart` (`@nivo/sankey`,
  d3-sankey, react-spring — ~88 KB gz) is a `lazyComponent` at module level in `FlussoTile`
  (`components/ui/lazy-component.tsx`), so below 640px, where the tile draws the bar and rows, nothing of it is
  downloaded (`e2e/bundle.lazy.mobile.spec.ts`, seen red with the static import back). Where the Sankey is drawn the download starts
  when `FlussoTile`'s module is EVALUATED (`CashflowSankeyChart.preload()`, guarded by `SANKEY_DRAWN_QUERY`:
  from 640px — since 2026-11-12 the Flusso sits in «Dettaglio» below the grid at the page's whole width, the landscape stage included, where from 2026-10-16 it had been a row of the index that fetched nothing), and with the module in memory the chart draws in the same render as the figures — a `next/dynamic` held
  its Suspense placeholder ~275 ms after them even then (warm on the mirror: 1613 ms to the first figure with no
  placeholder, 1343 with the helper, develop 1430). The placeholder fills a box of the plot's own height
  (`minHeight` = `resolveSankeyHeight`, a `flex-1` `Skeleton`), so the chart lands in place — `e2e/bundle.lazy.spec.ts`
  holds the Sankey's chunk until the placeholder is measured (`holdChunks`: a fixed delay lost the race to the preload)
  and asserts `layout-shift` 0 and equal heights, each seen red alone; it navigates to `domcontentloaded`, since the
  held chunk is requested before `load`.
- **Every other plot of the page is lazy too** (2026-09-30): the three disclosures' (`ConfrontoAnnualeCharts.tsx`,
  `SavingsRateLineChart.tsx`, `AndamentoStoricoCharts.tsx`) and the Scheda's trend (`EntityTrendChart.tsx`) are
  `lazyComponent`s in the component that owns them, each in a box of its height (the Andamento's B and C change
  theirs with the width: the box knows it, the placeholder fills it), preloaded once the page is idle AFTER its data
  (the disclosures mount after it; AnalisiTab passes `!loading` for the Scheda's — started during the load, the
  preload pushed the first figure ~130 ms later). recharts is out of Analisi's initial JavaScript: 744,9 → 564,6 KB
  gz; an opening draws in 3–20 ms and `layout-shift` is 0 at each, at 1440 and 390, measured on the mirror.
- **The Flusso picks its drawing by its CELL — a legibility threshold of the chart, not a second composition: in a
  cell from 608px (a 640px viewport's, 640 − `main`'s 2 × 16) the Sankey, narrower a share bar and ranked rows**
  (owner's decision, 2026-09-27, at 640px of viewport; by the cell since 2026-10-16 — a tile that can be a row lays
  out by its container, AGENTS.md § Tailwind Breakpoints and Responsive Layout; `DettaglioDisclosure`'s `useElementWidth`
  on the Flusso's cell against `FLUSSO_SANKEY_MIN_CELL` since 2026-11-12 — AnalisiTab's until then —, the viewport's
  `useMediaQuery('(max-width: 639px)')` only until the first measure; a viewport query had drawn a 320px Sankey in the
  landscape index). So the Sankey from 640px (inside «Dettaglio», at the page's width), the bar and rows on a phone. A four-column Sankey gets ~80px a column at 390, so
  the phone gets the chart's DATA instead: the same figures, the same words, the same landing (a row opens the Scheda
  through `handleEntitySelect`). In a narrow cell no Sankey model is built at all — no view, no `resolveSankeyHeight`, no
  chart label — and the type breakdown is built only when the phone's type view is what the tile draws
  (`buildTypeFlowBreakdown`, called in `FlussoTile`, not in AnalisiTab). The builders and the chart have no phone
  variant any more (the old top-N cut and its «solo le voci principali» note were deleted with the last caller).
- **Flusso has two views once `spendingRolesEnabled` is on — «Per ruolo» (the default) and «Per tipo»** (today's view,
  unchanged): an `AsideToggle` named «Raggruppa il flusso» (a group of `aria-pressed` buttons, ONE Tab stop on the
  pressed option, 44px below `desktop:`), hidden inside a drill, beside the «Sottocategorie» toggle — two Tab stops in
  the aside, one on a phone. The roles view is the same classic Sankey: Entrate (+ «Coperto dal patrimonio») → Budget →
  Necessità / Desideri / Da classificare / Risparmi → categorie (`buildSpendingRolesFlowData`, subcategory layer too,
  same top-6×4 cut). A category split by a subcategory override is one node per role, its label qualified by the role.
  A role node drills to its categories like a type node (`buildSpendingRoleDrillDownData`). The reading is
  `describeSpendingRolesFlow`, whose shares come from `summarizeSpendingRoleShares` — the source the phone bar reads
  too — in `SPENDING_ROLE_FLOW_ORDER`, the order the Sankey and the bar draw, rounded so they add up to 100 as printed.
  Its nodes keep the builder's order (`nodeSort="input"`), or a role's categories interleave with another's by value.
  Entrate and Budget keep the type view's colours — under a costume the theme's slots (`costumeSankeyPalette`); the
  type view's memo then reads these colours only, never the roles' —; the roles are the five `--role-*` aliases (doc/guide/temi.md), mapped
  once in `lib/constants/spendingRoleColors.ts` (`SPENDING_ROLE_TOKEN`, `spendingRoleColorVar`),
  resolved to hex by `useCssColorTokens` ONLY while the roles Sankey is on screen (its `enabled`), their categories
  the derived shades as under a type; the type view's memo never depends on them.
- **Two owner wordings (2026-09-27).** (a) «Risparmi» keeps its name in the roles view although it is the rows
  classified as saving PLUS the surplus, while the type view's «Risparmi» is the surplus alone — so whenever saving rows
  exist the reading says what it is made of: «risparmi 30% (di cui 300 € accantonati e 450 € avanzati)», or «(tutti
  accantonati)» without a surplus. (b) The phone's surplus note keeps the past tense, «X € avanzati nel periodo.», and
  a running year's calendar is declared, never re-worded: `describeFlowSurplus` appends the shared `scheduledSentence`
  with the verdict's own `scheduled` slice and `describeAnalisiScheduledHorizon`, both handed down by AnalisiTab.
- **Three rules the owner's tour found on real data (2026-09-27)**, each pinned by a Vitest case seen red.
  (a) **A name that repeats is qualified by what actually differs** (`resolveRoleCategoryLabels`): the same category
  split across two roles takes the role («Abbonamenti (Necessità)»), two DIFFERENT categories that share a name inside
  one role take the type («Casa (Spese Necessarie)» / «Casa (Spese Non Necessarie)» — the role they share printed «Casa (Da
  classificare)» twice), and both when both happen; the phone's rows do the same per role (`labelRoleSlices`), and the
  roles summary keys its slices by type AND key, as the Sankey's aggregation does. (b) **A derived shade never goes below
  55% of its base** (`MIN_SHADE_FACTOR` in `deriveSubcategoryColors`): the ramp had no floor and painted every node from
  the eighth on #000000, invisible on a dark theme — in the type view too, from the fifth category of a type on the
  shades are now the floor's. (c) **A share that holds money and rounds to zero reads «meno dell'1%»** in a sentence and
  «<1%» in a legend (`describeShare` / `describeShareCompact`), never «0%»; the drift that makes the shares add up to
  100 never pushes a share of one point down to zero, so a printed zero always means «less than half a point».
- **On a phone** `FlowShareMobile` draws both views and computes nothing a reader sees but a group's row shares and
  its «Altre N categorie» (the ranking's precedent, `ClassificaTile`): the bar is the shared `CompositionBar` with its additive props —
  `ticks` (50 and 80), the `edge` (the red «entrate» line, clamped by the pure layer; its word sits right of the line
  below the bar's middle and left of it above, so it never paints outside the tile), whole-percent legend
  (`legendDecimals`) named «Quote del flusso» — and every sentence is a `Narrative` from analisiNarrative:
  `describeSpendingRolesBar` / `describeTypeFlowBar` under the bar (the deficit tail, or «Nessuna entrata: tutto è
  coperto dal patrimonio.» with no line at all when income is ≤ 0), `describeFlowSurplus` under the savings group,
  `describeFlowAbsence` (`missing` / `zero`) instead of a flow. «Mostra tutte» under a group of more than five rows is a
  real disclosure (`aria-expanded`, `aria-controls` naming the list). `SpendingRolesMobileFlow` draws the 50/30/20 bar
  on the reading's own base (income + what the wealth covered); `SpendingTypesMobileFlow` — the only view with the
  roles off — draws ONE bar of the SPENDING by type, then each type's categories, then «Risparmio» as a closing block,
  absent in a deficit: the base is the spending because `describeFlow` prints the types over the spending and the
  savings over the income, and `buildTypeFlowBreakdown`'s blocks ARE `flow.typeShares`. Both print
  `TypeShare.printedPercentage`, rounded ONCE in `summarizeFlow` with the drift on the largest type (no type is a
  remainder), so three equal types read 34 + 33 + 33 and never 99; `percentage` stays unrounded and nothing on screen
  prints it. Colours: the one type map
  (`EXPENSE_TYPE_COLOR_VAR`, savings `CASHFLOW_SERIES_COLOR.income`), never the Sankey's hex. The subcategory toggle
  and the node count are hidden there. The rules of the roles themselves are in doc/guide/cashflow.md § 50/30/20 roles.
- **`RankedRows` is a real `<ul>`, and a clickable row is a real `<button>` inside its `<li>`** — named
  «{label} · {caption}, {amount}, {share}%» (the caption is the day and the subcategory of a single expense) with
  `aria-current` on the focused one. Never `role="listitem"` on the button (the `CompositionList` habit): the explicit
  role wins and strips the button semantics, so a screen reader announces a list item with no cue that it acts. **A `Tile` head WRAPS** (`flex-wrap`): an aside carrying controls (a pill, a
  select, two actions) drops under the eyebrow on a phone instead of pushing the tile past 390px — the first collaudo
  run measured 30–95px of horizontal scroll on the Scheda and the disclosures before it did.
- **Playwright**: `getByRole('region', { name: 'Periodo' })` also matches «Verdetto del periodo» — pass `exact: true`;
  the rows are located by role `button` (not `listitem`), and a Spese maggiori row is named after its category too
  («Casa · 15 gen · Condominio, …»), so scope a `/^Casa, /` locator to its tile. The analisi projects seed their own account (every row in January).
- **The savings floor** (2026-11-12, `readSavings`): the Flusso's reading takes the period's `SavingsReading`
  (`describeFlow(flow, reading)`) and says a deficit in euros — «; le spese superano le entrate di 600 €» — never as a
  negative share; «Andamento risparmio» draws a month below the floor or without income as a gap
  (`buildSavingsRateTrendPoints` in `analisiSummary.ts`, `meaningfulSavingsRate`), its axis floored at −100%, and the
  chart's description names the gap «spese oltre le entrate» (`overspent`) or «nessuna entrata». **The gap is
  bridged** (owner, 2026-11-23: the bare gap read as a broken line): one dashed segment in the line's colour from the
  month before the gap to the month after it, however long the gap (`buildSavingsRateBridges`, a recharts
  `ReferenceLine segment`), none at an edge of the window; the month is still not a point, and its tooltip label says
  why («Mar 26 · spese oltre le entrate» — through `labelFormatter`: recharts drops a null value, so `formatter` is
  never called for it). `__tests__/savingsRateTrend.test.ts` pins the points and the bridges
  (`buildSavingsRateTrendPoints`, `buildSavingsRateBridges`: a long gap, the edges, an empty window),
  `analisiNarrative.test.ts` the deficit sentence; the dashed segment and the tooltip label are drawn by
  `SavingsRateLineChart` and have no test — the repo renders no Recharts chart under jsdom —, seen on the tour of 2026-11-23.

## Composizione mobile

Composed for a small screen on 2026-10-14 (its spec, retired on 2026-10-15, is in `git log -- doc/mobile/`; the primitives and the sample page are Hall of Fame's, doc/guide/hall-of-fame.md § Composizione mobile): below `desktop:` the page is composed, at 1440 it is the page above with two declared changes — «; Casa pesa» became «. Casa pesa», and the calendar left the sentence for the verdict's `scope`, under the paragraph. The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this page does with them.

- **THE tile**: «Dove vanno i soldi» (`ANALISI_CLASSIFICA_ID` = `analisi-classifica`, since 2026-11-12; the Periodo until then), open at every width: the spending ring by type (150px at 1440, 120px below — `sections.compact`; the centre abbreviated by `RingChart`, «42,5k €», and never lifted — DESIGN.md → The Lifted-Figure Rule) beside the ranking; below a 520px container the ring and its legend sit side by side over the ranking. The axis (`AnalisiPeriodControls`) is the verdict's `axis` slot below `desktop:`, right under the title, and beside the verdict at 1440 — two instances of one control (DESIGN.md → Page Verdict, 2026-10-10); the DOM order is the reading order (DESIGN.md → The First-Screen Rule).
- **The strip** (`selectAnalisiStrip(totals, { notStarted })`, `analisiSummary.ts`): «Entrate» (`totals.income`) → `analisi-entrate`; «Risparmio» (`totals.net`, `currency`: «−» only on a negative) → `analisi-periodo`, whose reading is the savings. `[]` with nothing flowed or a period not started.
- **Lifted blocks** (The Lifted-Figure Rule; `LIFTED_FIGURE_CLASS`, hidden below `desktop:`; the keys guarded by `isPeriodoLiftedBlock` and `isFlussoLiftedBlock` — the latter in `analisiSummary.ts`, so the page never imports a value from the lazy `FlussoTile` — and the Flusso's captions handed the printed figures as `printedFigures`, from `collectPrintedFigures`): «Entrate» lifts the Periodo's `trio` (`PeriodoTile` `liftedFigures: ['trio']`: the three amounts — the strip's two, the first sentence's spending —, the spending delta, which IS the first sentence's pacing (owner's call of 2026-10-14), and the caption naming their baseline; the income delta stays); «Risparmio» lifts the Flusso's «Risparmio» (below). No ring's centre is ever lifted (owner, 2026-11-12: the centre is the total its arcs add up to; DESIGN → The Lifted-Figure Rule).
- **The Flusso in «Dettaglio»** (since 2026-11-12): the first tile of the disclosure, only with a flow; the trigger line reads «Il flusso del periodo e il risparmio mese per mese» («Il flusso, il risparmio e i flussi nel tempo» in history). Its tile is a `lazyComponent` fetched at idle, so an opening draws it with no placeholder (`e2e/bundle.lazy.spec.ts`); the Sankey's own chunk is still requested when the tile's module is evaluated, from 640px (`SANKEY_DRAWN_QUERY`, `(min-width: 640px)`: «Dettaglio» spans the page at every width).
- **The Flusso as bar and rows** (a cell below 608px: a phone; `FlussoTile` `liftedFigures: ['risparmio']`): the type view's «Risparmio» block hides whole (header and note print the surplus); the roles view hides «Risparmi»'s note — the group whole when no row is classified as saving (its header is then the surplus). The bar stays. Its captions drop an amount the first screen prints (owner, interactive, 2026-10-14): `collectPrintedFigures(lead, strip)` collects the magnitudes of the first sentence and the cells, `describeTypeFlowBar`/`describeSpendingRolesBar` take it — «Quote delle spese.» (the spending is the sentence's), «Quote di quanto è uscito; tacche…» (the base is the income the cell prints — and in a deficit it is income + deficit = the SPENDING the sentence prints, so the amount drops there too: corrected in the retirement of 2026-10-15), «Oltre la linea delle entrate, il resto viene dal patrimonio.» (the deficit is the cell's). A group's total is `formatFlowAmount`, the cell's identity in `analisiSummary.test.ts`.
- **The rows and their aside, in DOM order** (ids `ANALISI_SECTION_IDS`; `resolveAnalisiSections`): `analisi-maggiori` («per importo») · `analisi-cambiato` (its comparison phrase, or the anomalies' month; only with a comparison or anomalies) · `analisi-entrate` («per categoria») · `analisi-periodo` («entrate e spese») · `analisi-scheda` (the entity's name; only with a focus). `flusso` stays in `ANALISI_SECTION_IDS` as a lift key, never a row. No row is `failed`: one read.
- **The Scheda opens by itself**: every landing (`handleEntitySelect`, the URL restore) goes through `landOnScheda`, which in the same `setTimeout` calls `sections.reveal('analisi-scheda')` when the Scheda is a row (its trigger exists, or `COMPACT_QUERY` matches — a restore can run before the first render after hydration knows the width), else GLIDES to the tile — 450 ms on ease-out-quart, the Scheda rising 8px in over the last 200 ms, a jump under reduced motion (`glideIntoView` + `riseIn`, `lib/utils/smoothScroll.ts`, test `__tests__/smoothScroll.test.ts`; owner, 2026-11-15, the mirror tour of «Classifica»; until then `behavior: 'instant'`). The row's `reveal` keeps the browser's own smooth scroll. The way back glides as well (same day): «Chiudi» centres the opener over 450 ms (`glideIntoView(trigger, 'center')`, still when it is already in view) and only THEN closes the Scheda and focuses the opener (`closeBackToTrigger`) — closing first shortened the page and the browser clamped the scroll in one frame. The restore effect sits AFTER the controller so it can hand it `sections.reveal`. The chevron closes the row, not the focus — the URL keeps it, a reload opens it again; Escape closes the Scheda only inside `#analisi-scheda-panel`; «Chiudi» returns the focus to the opener, or without one (a deep link) to «Apri tutte» (`PageRest`'s `buttonId`; the Scheda is the last row since 2026-11-12) — the heading «Il resto della pagina» is an `h2` and takes no focus. Only the opener's path has a browser proof; the branch without one has none, in a browser or in Vitest (declared, 2026-10-15).
- **`binding` clauses and the `scope`**: no clause is `binding` (`analisiNarrative.ts` marks none: the cut is «The verdict», below). **The calendar is the `scope`** (`describeAnalisiScope`, the shared `scheduledScope` over `describeAnalisiScheduledHorizon`; DESIGN.md → The Binding-Clause Rule, 2026-10-10): under the strip on a phone, under the paragraph at 1440, never the sentence's last clause; the tile readings (`describeFlowSurplus`) keep it.
- **The verdict** (`buildAnalisiVerdict`): `leadLength` closes the first sentence — the total and its pacing («Nel 2026 hai speso 30.000 €, −4,2% su gen–ago 2025.»). Behind «Il perché»: the heaviest category, the mover, the anomalies (`restLabel` «le categorie», «categorie e fuori scala»; «il fuori scala» with anomalies and no category, a sentence of its own).
- **Absences**: one read for the page (the expenses and the categories, `loadFailed` in `app/dashboard/analisi/page.tsx`), so no row is ever `failed`. Loading with nothing held is `TileGridSkeleton` (`SKELETON_CELLS`, a toolbar below `desktop:`); a failed read is one `ErrorNotice` under the header in place of the page, before every reading; nothing recorded (no expense at all) is one tile «Analisi» saying so — in all three no verdict, no strip, no rows, no `PageRest`. A period with nothing flowed keeps the verdict without a strip and without the Flusso in «Dettaglio».
- **The memory**: `mobile-sections:analisi` (route `analisi`, no tab: a page of its own), per device and browser, not per account; absent or unreadable → the page's defaults, every row closed (no `defaultOpen`); «Il perché» is the row `perche`.
- **Measured** (`census@example.com`, 2026-11-15, «Classifica»): 390 2,11 schermate · 1/0 · 8/4 (LA tessera «Dove vanno i soldi» alta 654 px; il centro dell'anello non è una cifra sollevata) · prima riga chiusa sotto la pill; 768 1,27 · 5/3 · 14/11 · prima riga chiusa sotto la pill (LA tessera senza una curva da cedere); 1024 1,43 · 5/4 · 14/10 (doc/guide/prima-schermata-misure.md § Registro). Until 2026-11-12 (`census@example.com`, 2026-10-14): 390 1,86 schermate · 1/0 · 8/5 (le due celle, la lettura del Periodo, la freccia delle entrate e la quota di risparmio del trio; la freccia delle spese è il primo enunciato, sollevata dal 2026-10-14) · prima riga chiusa sotto la pill (1031 contro 767, `raisedBy`); 768 1,27 · 6/5 · 12/9 · riga sopra la pill; 1024 1,61 · 1/0 · 12/9 (informative: il budget teneva 7 fino allo stage orizzontale del 2026-10-16), LA tessera non più intera (`raisedBy`). Prima: 390 3,68 · 12/7.
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`, `useTabletComposition` + `useTabletStage`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage): at 768 two columns — «Dove vanno i soldi» on both, «Il resto» on a row of its own, the rows two by two, an open row and a closed one left alone whole. **On a tablet in landscape** (a content box ≥ 880px below 1440: 936 at 1024×768 beside the icon rail) the page is a STAGE: on the left the short verdict (the axis under the title, «Il perché», the strip on one row) and THE tile under it, 16px apart, sticky while the page scrolls when the left stack fits the screen, the tile reaching the fold; on the right the 360px INDEX, ONE card with «Il resto» and every row flat under hairlines, each opening in place. **The Scheda appears as a row and opens by itself**: in the index, at its place in the DOM's order, with `landOnScheda` scrolling to it as on a phone. The Flusso is no longer in the index: «Dettaglio» spans the page below the stage, and the Sankey draws from a cell of 608px (`FLUSSO_SANKEY_MIN_CELL` in `DettaglioDisclosure.tsx`; the viewport's `(max-width: 639px)` guesses only until the first measure). The two rings at 768 and 1024: `e2e/classifica.tablet.spec.ts`.
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, 2026-10-16, landscape only; `describeAnalisiClosedAnswers({ topExpenses, changes, anomalies, incomeRanking, savings })` in `analisiNarrative.ts`, through `RowAnswers`; a `null` keeps the row's aside, and below landscape every row keeps it):
  - Spese maggiori: «la più grande {€ compact}»; null with no expense.
  - Cosa è cambiato: the largest mover «{cat} {±€}», signed as its row prints it; without a comparison the first anomaly «{cat} +{%}» in red; null with neither.
  - Entrate: the first category «{cat} {%}» (`Math.round`); «tutto da {cat}» with one, «quasi tutto da {cat}» when the first rounds to 100 beside others; null with no row (`describeCategoryShareAnswer`).
  - Periodo: «messo da parte {%}» while the period's rate rounds above zero; null otherwise (a deficit is euros, and the strip's «Risparmio» prints them).
  - Scheda: null — the entity's name is the answer, and it opens by itself.
- **The specs**: `e2e/mobile-composition.analisi.mobile.spec.ts` (`analisi-mobile`; a decoy row on the 28th of December carries the scope), the scope at 1440 in `e2e/analisi.spec.ts`; `analisi.mobile.spec.ts` and `bundle.lazy.mobile.spec.ts` open their rows (and «Dettaglio» for the Flusso) first; the rings' fit in the last `describe` of `analisi{,.mobile}.spec.ts` (one planted income row) and in `classifica.tablet.spec.ts` — `ringCenterMaxChars` forced to 12 leaves them green (the fixture's «780 €», «1420 €» fit whole): the falsification that turns them red at 390, 768, 1024 and 1440 is the centre's font drawn ×2,5 (2026-11-15); `__tests__/analisiSummary.test.ts` (`selectAnalisiStrip`, the cell's identity) and `__tests__/analisiNarrative.test.ts` (`describeAnalisiClosedAnswers`); `npm run mobile:budget` holds the surface `analisi` of `perf/mobile-budget.json`.

## Per-page blind spots
- **The Scheda rises in only when it OPENS** (owner, 2026-11-27): `landOnScheda(reveal, alreadyOpen)` glides in both
  cases, and runs `riseIn` only when the cell was not on the page when the entity was chosen (`schedaRef.current`
  read by `handleEntitySelect` before the state change). The entry's backwards fill holds the cell at opacity 0
  until the glide lands: on a Scheda already under the reader's eyes — a subcategory picked inside it — that was
  250 ms of empty page. Held by «a subcategory picked inside the open Scheda never hides it» in
  `e2e/analisi.spec.ts`, which reads the cell's lowest opacity frame by frame.- **A pick in «Vai a categoria…» lands AFTER the modal has closed** (2026-10-20): `EntitySearch` parks the target in a ref and calls
  `onSelect` from `ResponsiveModal`'s `onExitComplete`. Fired at once, `landOnScheda` scrolled the Scheda in at 50 ms and the
  modal's focus restore — `trigger.focus()` after the exit animation, and a focus scrolls — pulled the page back up to the
  header a moment later (the owner saw the one-second jump on the mirror). The order also hands the Scheda the focus last,
  and `handleEntitySelect` now records the search button as the opener, so «Chiudi» returns there. Held by the viewport
  assertions in `e2e/analisi.spec.ts` («reaches a zero-spend entity…»), red on the old order.


- **Analisi**: **the Andamento storico ranks its six categories on every row from the floor on, the rows after this year included** (found 2026-09-30 by the invariance dumps: a materialised plan's instalments to 2043 decide which categories are drawn, while the axis stops at today's month — `buildCategoryTimeSeries` ranks before the ceiling applies; whether the ranking should stop at the ceiling is a decision not taken, and the reason the page reads the whole collection rather than a window closed on December); «Fuori scala» runs on ONE month only (25% / 50 € over a 6-month average, hardcoded); a month not started gets «non è ancora iniziato»; «Mostra tutte», the Confronto year and the Flusso toggles are session-only; the Scheda's transactions window is 25 + «Mostra altre»; `EntityDossier` stays Recharts; `AndamentoStoricoSection` computes in the component (untested; `SavingsRateTrendSection`'s points are `buildSavingsRateTrendPoints`, tested since 2026-11-12); a drill opened in a Sankey disappears when the Flusso's cell drops below 608px (a narrower window, a rotation) and comes back when the width does (it is stored with the drawing, not reset); **a failed settings read turns the roles view off silently**, by design — the settings are non-fatal for the page (the history floor and the flag keep their defaults, only «Per tipo» shows, a `console.error` says it): since 2026-09-29 the read is `useSettings`, the ONE settings key every page shares, so it fails where every page's does and heals with the next invalidation, but nothing on the page says why; the type Sankey's income nodes are magnitudes per row (a reversal enlarges them), the roles Sankey's are signed and net per category, as the readings are; a previous month recorded in one batch (every row late in the month) leaves the running month with NO comparison under the same-days rule until the days catch up, and the Periodo says so; no spec covers «Anno» with a month.
- **Below 1440, wherever the Flusso's cell reaches 608px, its Sankey prints the surplus beside the strip's «Risparmio» cell** (accepted and declared with the composition, 2026-10-14; by the cell since 2026-10-16: from a 640px viewport up, a tablet in landscape included since the Flusso moved into «Dettaglio» on 2026-11-12): the lifted blocks (`FlussoTile` `liftedFigures`) are the bar-and-rows drawing's; the Sankey's «Risparmio» node is the chart's own label, not a repeated block.
- **Analisi › Flusso per ruolo — the single render of `FlussoTile` was never measured** (2026-10-08): with `ChartColorsProvider` above it the tile reads its five `--role-*` hexes from the context and `useCssColorTokens` schedules nothing, so the second render it used to pay is gone BY CONSTRUCTION — the same context Storico and FIRE read, where a client navigation reads 0 palette tokens (`e2e/motion.layout.spec.ts`); no spy on Analisi with the roles on and no census `mount` of `/dashboard/analisi` were taken. The day a census of Analisi is run, `FlussoTile` should appear once per load in `byName`.
