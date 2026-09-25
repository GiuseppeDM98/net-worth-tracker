# Cashflow › Analisi

> **When to open this guide** — you are editing `components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/*`,
> or `lib/utils/{analisiSummary,analisiNarrative}.ts` (the four-mode axis, the composition tiles, the entity Scheda,
> the Sankey). In `AGENTS.md` only the short stub remains; the full rule is here. Modules and files: § *Files* below. The block names Playwright — specs `e2e/analisi.spec.ts` and
> `e2e/analisi.mobile.spec.ts` (auth setup `e2e/auth.analisi.setup.ts`), seed `scripts/seedAnalisiE2E.mts` via
> `npm run e2e:seed:analisi` with the emulators up.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Analisi**: `components/cashflow/AnalisiTab.tsx` (`handleEntitySelect`) + `components/cashflow/analisi/*`, `components/cashflow/{EntityDossier,EntitySearch,ConfrontoAnnualeSection,CashflowSankeyChart,SavingsRateTrendSection,AndamentoStoricoSection}.tsx`; pure `lib/utils/{analisiSummary,analisiNarrative,expenseGrouping,cashflowSankey,cashflowComposition,expenseCategoryMatching,comparisonDeltas,expenseEntityStats,entitySearch}.ts`

## Analisi — a verdict over tiles (`components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/*`, `lib/utils/{analisiSummary,analisiNarrative}.ts`)
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
- **«Fuori scala» is an Off-Axis tile**: the anomalies run on ONE month (`resolveSingleMonth`: the picked one, or
  today's for the bare running year); the aside names it, and the verdict's clause names it too unless the period IS
  that month. When no month can be meant (a past year without a month, the history, **a picked month that has not
  started** — its calendar has no six-month average to run hot against, 2026-09-14) the tile is ABSENT and Spese
  maggiori takes 7 columns — never an empty tile with a placeholder. A Spese maggiori row dated ahead ranks (it is in the
  total) and its caption says «· in calendario» (`rankTopExpenses`' `isScheduled`, fed with `isScheduledRow`); a long
  caption wraps in `RankedRows`, never truncates.
- **The Scheda's pace is measured on the months LIVED, never a calendar total over the months lived** (2026-09-14, the P0 of the
  Impeccable critique): `computeEntityRunRate` splits `periodTotal` at `now` into `livedTotal` and the calendar ahead, and
  `periodMonthlyAverage = livedTotal / livedMonths` (12 for a closed year, today's month or the `throughMonth` cut for the running
  one, 1 for a month). On the real account a 559 € mortgage with twelve instalments materialised printed «al ritmo di 746 € al
  mese» (6710 / 9) beside «Media ultimi 12 mesi 559 €» and «Proiezione 2026 8946 €» ((6710 / 9) × 12) above a total that already
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
  prints «Nessun movimento nei primi 14 giorni di settembre 2025: nessun confronto.» in the Periodo where the caption would stand
  (on the real account September 2025 is recorded in one batch from the 21st). **«Anno corrente» keeps its twelve-against-twelve
  delta (the Same-Basis call of 2026-08-30) and now names its cost where the red is printed**: the Periodo reading's comparison
  is «su 2025 (3 mesi ancora in calendario)» (`comparisonPhrase` in `AnalisiTab`) while the year runs. Pinned by
  `comparisonDeltas.test.ts` and `analisiNarrative.test.ts`.
- **The Flusso is legible on the real account or it is not a Flusso** (2026-09-14): the plot's height comes from its widest column
  (`countSankeyLayers` → `resolveSankeyHeight`: a 26px row per node from `desktop:`, 22 below, floor 500/400, cap 1100 — a fixed
  500px packed 30 categories at 10px of spacing and 16 pairs of labels overlapped), the nodes are aligned `start` (a leaf category
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
- **`RankedRows` is a real `<ul>`, and a clickable row is a real `<button>` inside its `<li>`** — named
  «{label} · {caption}, {amount}, {share}%» (the caption is the day and the subcategory of a single expense) with
  `aria-current` on the focused one. Never `role="listitem"` on the button (the `CompositionList` habit): the explicit
  role wins and strips the button semantics, so a screen reader announces a list item with no cue that it acts. **A `Tile` head WRAPS** (`flex-wrap`): an aside carrying controls (a pill, a
  select, two actions) drops under the eyebrow on a phone instead of pushing the tile past 390px — the first collaudo
  run measured 30–95px of horizontal scroll on the Scheda and the disclosures before it did.
- **Playwright**: `getByRole('region', { name: 'Periodo' })` also matches «Verdetto del periodo» — pass `exact: true`;
  the rows are located by role `button` (not `listitem`), and a Spese maggiori row is named after its category too
  («Casa · 15 gen · Condominio, …»), so scope a `/^Casa, /` locator to its tile. The analisi projects seed their own account (every row in January).

## Per-page blind spots

- **Analisi**: «Fuori scala» runs on ONE month only (25% / 50 € over a 6-month average, hardcoded); a month not started gets «non è ancora iniziato»; «Mostra tutte», the Confronto year and the Flusso toggles are session-only; the Scheda's transactions window is 25 + «Mostra altre»; `EntityDossier` stays Recharts; `SavingsRateTrendSection`/`AndamentoStoricoSection` compute in the component (untested); the Sankey drops small slices on phones; a previous month recorded in one batch (September 2025 on the real account: 65 rows, all from the 21st) leaves the running month with NO comparison under the same-days rule until the days catch up, and the Periodo says so; no spec covers «Anno» with a month.
