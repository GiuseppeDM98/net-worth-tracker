# Cashflow › Analisi

> **When to open this guide** — you are editing `components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/*`,
> or `lib/utils/{analisiSummary,analisiNarrative}.ts` (the four-mode axis, the composition tiles, the entity Scheda,
> the Sankey). In `AGENTS.md` only the short stub remains; the full rule is here. Modules and files: `CLAUDE.md` →
> *Key Files* → the **Analisi** entry. The block names Playwright — specs `e2e/analisi.spec.ts` and
> `e2e/analisi.mobile.spec.ts` (auth setup `e2e/auth.analisi.setup.ts`), seed `scripts/seedAnalisiE2E.mts` via
> `npm run e2e:seed:analisi` with the emulators up.

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
  that month. When no month can be meant (a past year without a month, the history) the tile is ABSENT and Spese
  maggiori takes 7 columns — never an empty tile with a placeholder.
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

- **Analisi**: «Fuori scala» runs on ONE month only (25% / 50 € over a 6-month average, hardcoded); a month not started gets «non è ancora iniziato»; «Mostra tutte», the Confronto year and the Flusso toggles are session-only; the Scheda's transactions window is 25 + «Mostra altre»; `EntityDossier` stays Recharts; `SavingsRateTrendSection`/`AndamentoStoricoSection` compute in the component (untested); the Sankey drops small slices on phones; no spec covers «Anno» with a month.
