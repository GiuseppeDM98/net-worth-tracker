# Previdenza (Fondo Pensione)

> **Quando aprire questa guida** — chi tocca `app/dashboard/pension/page.tsx`, `components/pension/*`, `types/pension.ts`, `lib/utils/pension*.ts`, `lib/services/pensionContributionService.ts`. Esercizio emulatore `scripts/seedPensionE2E.mts`; specs `e2e/pension*.spec.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Previdenza**: `types/pension.ts`, pure `lib/utils/{pensionSummary,pensionNarrative}.ts` over `lib/utils/{pensionDeduction,pensionContributions,pensionReturn,pensionFire,pensionFamilyMembers}.ts` (`indexPensionSnapshots` = the snapshots reduced ONCE to the funds; `isPensionValueStale` = the ONE age of a hand-kept value), `lib/services/pensionContributionService.ts` (`assertFundValueLivesInQuantity`, `updatePensionFundValue`), `app/dashboard/pension/page.tsx`, `components/pension/*` (`PensionValueDialog`, `pensionStyles.ts`); the two modals' words in `lib/utils/dialogNarrative.ts`; collection `pensionContributions`
- **Suites to run after a change here — Fondo pensione** (moved from `AGENTS.md` § Commands on 2026-09-30): `pensionDeduction`, `pensionContributions`, `pensionReturn`, `pensionContributionService`, `performanceBase`, `pensionFire`, `pensionUnlock`, `pensionFamilyMembers` + the transfer trio · **Verdetto e letture** `pensionSummary`, `pensionNarrative` (with `describePensionClosedAnswers`, the landscape index), `pensionRendimentoTile` · **Composizione mobile** `tabletComposition`

## Fondo Pensione

### Data model (`types/pension.ts`, `lib/utils/pensionDeduction.ts`)
- **`pensionFund` is an `AssetType`, never an `AssetClass`, and never a ledger type.** Its value is statement-driven, held
  in `quantity` **at price 1**; `TYPE_TO_CLASS['pensionFund'] = 'equity'` is a fallback for an empty `composition`, so
  any `assetClass`-keyed default effect must exclude the type explicitly.
- **An instalment plan declares its cost ONCE** (2026-08-28): with «Acquisto rateale» on, the dialog's top «Importo
  (euro)» is HIDDEN and `amount` is optional in the schema (a `superRefine` requires it only without a plan). It used
  to be required and then silently overwritten — `createInstallmentExpenses` writes `amount: installmentAmounts[i]`
  per row — so 100 there and 600 in «Importo totale» saved 600 without a word. «Importo totale» now exists in BOTH
  modes (it is what «Genera campi rate» divides in `manual`), and the save path reads `expenseData.amount`, never
  `data.amount`. The toggle is creation-only, so an existing instalment row still edits its own amount normally.
- **The `AssetType` union is enumerated in TWO places in `AssetDialog.tsx`** — `TYPE_TO_CLASS` and `assetSchema`'s
  `z.enum` (three indirect errors). Update both in one edit.
- **Two tax mechanisms, only one reads history.** ORDINARY deduction is stateless per year (ceilings via
  `getPensionDeductionCeiling` — a law change is one branch there, never a literal at a call site);
  EXTRA-DEDUCIBILITÀ is a multi-year fold maintaining a bank (accrual years 1-5 → drawdown 6-25 → expiry).
- **CORRECTNESS TRAP — `isFirstEmploymentPost2007` ON without a full contribution history inflates the plafond**, because
  the fold treats missing years as 0 contributed. OFF is correct whenever the past is not tracked.
- **The IRPEF ceiling is per TAXPAYER, not per account**: `computePensionTaxRecap` runs once per `FamilyMember` with
  contributions pre-filtered to that member's fund ids. **The `enrollmentYear` fallback must be computed from the
  MEMBER-FILTERED `deductibleByYear`**, or one person's history leaks into another's plafond.

### Contributions (`lib/services/pensionContributionService.ts`)
- **Client SDK, not an Admin route** — there is no multi-doc replay to serialise, and the only two-balance step is already
  atomic inside `reconcileTransferCreate`. That is the discriminator against the trade ledger.
- **Two write-side guards, both before anything is written**: the origin must be a real cash account
  (`updateCashAssetBalance` writes `quantity` directly, so a wrong origin subtracts euros from an ETF's share count) and
  `assertFundValueLivesInQuantity` must confirm the destination is a `pensionFund` priced at 1. **Write-side only** —
  `deletePensionContribution` has no guard, so a user can undo out of a broken state.
- **The orphan transfer is the dangerous failure**: a failed reconcile deletes the just-created `Expense`, and a failed
  contribution write reverses the value effect, both through `compensate` (best-effort, logged, never rethrown).
- **`taxYear` is validated as ±1 year from `date`** and both roll-ups group by `taxYear`, NEVER `date.getFullYear()`.
  **Contributions never touch spending or savings, by construction** — TFR/employer create no `Expense`, voluntary
  creates a net-zero `transfer`. A nature needing a non-transfer `Expense` means re-auditing every consumer.
- **The periodic statement (NAV overwrite) is NOT a contribution** — plain `updateAsset`. **Register the month's
  contributions FIRST, then overwrite "Valore attuale"**: the statement already includes them.
- **Converting a pre-existing fund is a type EDIT, never delete + recreate** (`byAsset` is keyed by `assetId`): the submit
  branch reads the **stored** type so the edit goes through `updateAssetMetadata`, and the conversion deletes the asset's
  ledger trades. **Latent risk**: `quantity` is replay-derived, so replaying such an asset after conversion would wipe
  every contribution.

### Return (`lib/utils/pensionReturn.ts`)
- **Three causes of growth, three numbers — never one blended percentage.** The employer share is *compensation* and
  leaves the TWR, returning in `personalReturn = (marketGain + employer) / (startValue + voluntary + tfr)`; TFR is
  deferred salary → denominator, never numerator; the IRPEF saving stays in its own per-taxpayer card.
- **The window starts where the data is trustworthy, not where the snapshots start** (`resolvePensionReturnStart`), and
  **a contribution is attributed to the month its VALUE MOVED (`createdAt`), not its accounting date**.
- **A contribution the fund credits LATE reads as a temporary market loss** (decided 2026-08-26: no change). The model
  moves the value on `createdAt` and the user overwrites the value monthly from the fund's site, which shows the
  contribution 1-2 months later: the recording month subtracts a contribution the snapshot does not yet contain
  (market X too low), the crediting month contains it with nothing to subtract (X too high); the window's total is
  right once the credit lands and the value is updated. A «pending credit» contribution (registered for the tax
  year, value effect deferred until marked credited) is the fix, if ever — it touches the service, `valueEffectMonth`
  (shared with the Panoramica digest) and the dialog.
- **The series ends at the fund's LIVE value, not the current month's snapshot** (`overlayLivePensionValue`): the asset
  rises immediately while the snapshot waits for the cron, so the TWR would drop by exactly the amount paid in. Storico
  and Rendimenti stay snapshot-based.
- **`isPensionReturnMeasurable` = `!isCoverageSuspicious && !isCoverageContradictory && !hasNoMovement` is ONE
  predicate with two consumers.** *When two places must agree on whether data is trustworthy, the agreement is a named
  function.* An annualized return above 20% means missing contributions, not a brilliant fund — and its mirror image
  (2026-09-07, PR #323 merged with changes) is **`isCoverageContradictory`**: MORE contributions recorded than the
  growth they should explain, true on a three-flag predicate — a month that closes at or below zero net of its
  contributions (impossible: a fund is not worth less than nothing), a cumulative loss beyond 100% (impossible too, and
  in practice subsumed by the first: a negative index needs an odd number of negative factors), and a value that GREW
  while the TWR reads below −75% (a plausibility judgement: the threshold sits beyond any real drawdown, and a fund that
  crossed it with contributions lifting it back above its opening value would be misread — accepted). The real case:
  five months of contributions recorded on one day, attributed by `valueEffectMonth` to that month, read as +50/+33/+25%
  of «market» on the way up and then −97% when 2.250 € were subtracted from a 2.270 € month — printed as a measure while
  the guard only looked upward. **`resolveReturnState` reads the contradiction BEFORE the suspicion**: both flags can be
  true (two non-positive months turn the index positive again, a recovery annualizes past 20%), and «registra i
  versamenti mancanti» is exactly the wrong advice for broken data. `annualizedTwr` normalises a NaN (a negative index
  under a fractional power) to `null`, which is already the field's «not computable».

### Page and integrations
- **The year axis governs the annual tiles and the verdict's annual clauses only, never the fund value or the
  return** (see § Previdenza — a verdict over tiles); `resolveActivePensionYear` (pure) reconciles the selection with
  the derived axis so no effect has to sync them. Every tile degrades to an `ErrorNotice` instead of zeros, and
  the copy agrees in number (`fundSubject()` in `pensionNarrative.ts`).
- **Zod messages must be attached to the TYPE check, not only the constraint**: `valueAsNumber: true` turns an empty
  input into `NaN`, which fails `z.number()` itself — use `z.number({ error: '…' }).positive('…')`.
- **A derived split that a later edit can invalidate must be FROZEN at write time.**
  `MonthlySnapshot.pension` stores what the funds contributed to that month's `byAssetClass`,
  written by re-running `calculateCurrentAllocation` over just the funds — the same function that
  folded them in, so the two agree by construction and Storico subtracts an exact subset instead of
  reconstructing one from today's composition. It is written **unconditionally**, so `totalValue: 0`
  (measured, no funds) stays distinguishable from an absent field (unknown, older snapshot). The
  estimated fallback stays for pre-2026-08 months and for hand-entered snapshots, which have no
  pension input — `prepareAssetClassHistoryData` reports which path a month took via
  `pensionSource`, and the UI names the boundary month rather than warning about an approximation
  that no longer applies.
- `buildPensionLookThrough` (the Previdenza tile of Allocazione) needs the FULL unfiltered asset list; **Storico reverses the split
  `calculateCurrentAllocation` applied**, using the fund's CURRENT `composition` (a documented approximation); **FIRE's
  lock-in toggle subtracts from BOTH `currentNetWorth` and `illiquidNetWorth`** — and it is a bridge
  model across the whole FIRE page (see doc/guide/fire.md § FIRE, What If and Goals).
- **`performanceBase.ts` reads `byAsset`, never `byAssetClass`**, and both of Rendimenti's snapshot-fetch paths go
  through ONE `resolvePerformanceBase`. Since 2026-09-06 «Includi i fondi pensione» wins over the fund's
  `allocationRole` and, ON, brings the funds into the base from the `resolvePensionReturnStart` month as a FLOW (their
  whole value), with every later outside contribution a flow in its `valueEffectMonth` — the same two rules this page
  uses. A late-credited statement therefore reads as a temporary market loss on Rendimenti too
  (doc/guide/rendimenti.md § measurement base).

## Previdenza — a verdict over tiles (`components/pension/PensionOverview.tsx`, `components/pension/tiles/*`, `lib/utils/{pensionSummary,pensionNarrative}.ts`)

- The page answers «il fondo sta lavorando?» and computes nothing: `pensionSummary.ts` chooses what each tile shows
  (`summarizeFundToday` — the live value, the overlaid series, the month digest, what was ever paid in;
  `summarizePensionMembers` — one block PER CONTRIBUTOR with the return AND the tax recap; `summarizeVersato` and
  `summarizeLedger` on the axis year), `pensionNarrative.ts` puts it into words. `calculateAssetValue` and the IRPEF
  function are INJECTED (`valueOf`, `taxOf`) so the module stays SDK-free.
- **Three causes, three numbers, never one blended percentage** (The Three-Causes Rule): the verdict's sentence is
  «{market clause}, nel {Y} il datore ha aggiunto Z € e il fisco restituisce circa W €» — the market on the block's
  TRUSTED window («da novembre 2025», `resolvePensionReturnStart`), the other two on the AXIS year — and a cause with
  nothing behind it drops its clause (no employer share, no RAL). A closed year is said in the past («ha restituito»).
- **The return is computed per contributor**: the same `pensionReturn.ts` functions on the member's funds and the
  member's contributions (the configured `pensionReturnStartMonth` still wins for everyone), so the verdict and the
  Rendimento tile print the SAME TWR. A fund linked to no member is its own block, named by the fund, without a tax
  clause — never folded into someone else's RAL. `returnState` (`measured` · `suspicious` · `contradictory` · `idle` ·
  `no-contributions` · `one-point`) is the one discriminator the verdict, the tile and the Dettaglio read; when it is
  not `measured` the percentage is replaced by the reason everywhere, and «Da dove viene la crescita» is absent. The
  `contradictory` sentence says «più versamenti della crescita … o già inclusi nel valore inserito a mano, o contati due
  volte» and offers the configured start month — never «registra i versamenti mancanti».
- **The year axis sits beside the verdict** (Tracciamento's shape; under its title below `desktop:` since 2026-10-15, § Composizione mobile) and governs the verdict's two annual clauses,
  «Anno fiscale», «Versato nel {Y}» and «Versamenti {Y}»; «Il fondo oggi» and «Rendimento» are OFF it and name their
  own window in the aside («oggi», «nov 2025 → ago 2026»). The month digest of the hero (`monthEffect`) is measured
  exactly as the Panoramica's «Previdenza» line — live value − the previous month's snapshot − contributions
  recorded since (`valueEffectMonth`), null when the previous month has no snapshot with the fund or the window
  starts later — so the two pages never disagree on a number.
- **«Versato nel {Y}» is a ring when two natures or more were paid** (2026-11-12, DESIGN.md → The Ring Rule):
  `versatoRing(versato)` in `pensionSummary.ts` makes the natures ring parts, each in its FIXED slot
  (`NATURE_RING_COLORS`: TFR `--chart-2`, Volontario `--chart-7`, Datoriale `--chart-6`, so TFR wears one hue every
  year), the year's total «versati» in the hole; the rows are its legend (`RankedRows bars={false}`, each with its
  nature's swatch, the «deducibile» caption kept). One nature is no ring: the bar in `--chart-2` stays
  (`__tests__/versatoTile.test.tsx`; `e2e/ring-chart*.spec.ts` on the seed's 2026 and 2025).
- **Errors degrade per tile and the verdict says what failed** (`buildPensionLoadErrorVerdict`): a failed
  `pensionContributions` query hides the hero's reading and chips (a `[]` would say «nessun versamento registrato»)
  and replaces Rendimento, Anno fiscale, Versato and Versamenti with an `ErrorNotice`; a failed snapshots query
  drops the series and the Rendimento tile. `assets`/`settings` errors stay blocking.
- The ledger's delete is `useArmedDelete` (two clicks, no timer); the armed button reads «Conferma» and the ROW says
  the consequence in VISIBLE words («eliminando, il conto verrà riaccreditato», in the hint cell, `text-destructive`;
  inside the button it wrapped in the 90px action column — found on the owner's tour) and the tile owns ONE live region
  for arm and disarm — one per row made a keyboard reader hear «Eliminazione annullata» on every Tab away. Only one
  of the two ledger layouts is mounted (`useMediaQuery('(min-width: 1440px)')`, the `desktop:` query), never both
  hidden by class. Playwright locates the tiles by `role=region` + `aria-label`, which since 2026-09-13 is the
  visible eyebrow, year included (`/^Anno fiscale 20\d\d$/`, `/^Versato nel 20\d\d$/`, `/^Versamenti 20\d\d$/`,
  a regex because the name changes with the axis; «Il fondo oggi», «Rendimento del fondo»), the verdict by «Verdetto
  sul fondo pensione», the axis by the **radiogroup** «Anno fiscale» (`SegmentedPill semantics="radio"`: a
  tablist with no tabpanel was a promise the DOM could not keep; the pill also scrolls inside itself past five
  years), the disclosure by `/^Dettaglio/` — which is OPEN by itself when no block is measured (a first run's one
  orienting text), so the degraded specs assert `aria-expanded`, they do not click. The base fixture
  (`scripts/seedPensionE2E.mts`) runs in whatever month: assert the cumulative TWR («+3,48%») and the structure,
  never the annualised figure.
- **«Aggiorna valore» lives on the page** (2026-09-13, from the first Impeccable critique — P0): the monthly overwrite
  of the fund's value from the statement is the persona's one recurring job and the page taught it three times
  without offering it. `PensionValueDialog` (header, outline beside «Registra versamento»; and the hero's footer)
  calls `updatePensionFundValue` — NOT a contribution: `quantity` at price 1 through the same
  `assertFundValueLivesInQuantity` guard, `lastPriceUpdate` stamped, no record, no transfer. Its reading states the
  trap (the month's paid-in figure «sono già dentro l'estratto: non aggiungerli»), the contribution toast offers it
  as the next step, and `describeFondoOggiFooter` judges the value's age («valore fermo dal 12 ago 2026»,
  `valueIsStale` = last update in a closed month) instead of printing a neutral date. **That age is ONE rule**,
  `isPensionValueStale(resolveLastFundUpdate(funds), now)` in `pensionSummary.ts`, read by the hero's footer AND by the
  modal's reading («da un mese chiuso») — the modal re-derived it by hand until the polish pass of 2026-09-13. Never
  re-derive it in a component. «Anno fiscale» in the
  contribution form is a Select derived from the date (year −1 · year · year +1, the ±1 rule of the service now named
  beside the field by a `superRefine`); every error is wired to its field (`aria-invalid`, `aria-describedby`,
  `role="alert"`); the dialog's words are `PENSION_CONTRIBUTION_COPY` / `describePensionValueCopy` in
  `dialogNarrative.ts`. In the Rendimento tile — the page's 3-column tile — a row's hint («retribuzione, non
  rendimento») takes its own line under the label: inline, «Contributo datoriale» broke mid-word into three lines at
  1440 (the critique's last minor observation, measured by Playwright, closed by the polish pass). Anno fiscale and the
  Dettaglio keep the inline hint: at 4 and 6 columns it fits.
- **The snapshots are reduced ONCE** (`indexPensionSnapshots(snapshots, fundIds)` → `PensionSnapshotIndex`, memoized
  by the page on the snapshots alone and passed as `PensionSummaryInput.snapshotIndex`): `buildPensionValueSeries`
  used to re-read every `byAsset` of every month for the total, per contributor and per fund, and `computeMonthEffect`
  looked the previous month up by rebuilding the whole series once per fund. «Il fondo oggi» reads an off-axis
  input (`offAxisInput`, no `taxYear`), so the year pill recomputes only the tax half. Deliberately NOT done: bounding
  the `monthly-snapshots` query to the return window — the sparkline starts where the snapshots first carry the
  fund, which can predate the first contribution, and `queryKeys.snapshots.all` is the cache Storico and Rendimenti
  share (a second key would be a second fetch); and painting the tax tiles before the snapshots resolve — the
  verdict's market clause needs them, and a page that shows tiles under a verdict it cannot yet say is worse than the
  skeleton. Both are recorded here so the next audit does not re-propose them as bugs. In short — deliberately not
  bounded: the `monthly-snapshots` query (shared cache) and the four-query skeleton (the verdict needs the snapshots).

## Composizione mobile

Composed on 2026-10-15 (its spec, retired on 2026-10-16, is in `git log -- doc/mobile/`; the primitives and the sample page are Hall of Fame's, doc/guide/hall-of-fame.md § Composizione mobile): below `desktop:` the page is one sequence, the desktop DOM — the reading order on every device, never a CSS `order` swap (DESIGN.md → The First-Screen Rule); at 1440 nothing changes. The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this page does with them.

- **THE tile**: «Il fondo oggi», first in the DOM at every width, open and never a row (THE tile stays outside the sections controller: DESIGN.md → The First-Screen Rule); below `desktop:` its curve yields to 120px (`max-desktop:min-h-[120px] desktop:min-h-[180px]`, the chart yields, never the reading) — the value, the chips, the reading and «Aggiorna valore» (the month's gesture; absent in demo, as before) stay.
- **The axis** (DESIGN.md → Page Verdict: the `axis` slot right under the title, a second instance of the control at 1440): the fiscal year's `SegmentedPill` in `PageVerdict.axis`, under the title and before the strip; at 1440 the pill beside the verdict is a second instance of the same control (`hidden desktop:block`, the same state). One visible radiogroup per width.
- **The strip** (`selectPensionStrip({ blocks, taxYear })`, `lib/utils/pensionSummary.ts`; The Three-Causes Rule; the headline-only cut of The Binding-Clause Rule): **three cells or none** — only with ONE block and `returnState === 'measured'` (`hasPensionStrip`, the predicate the verdict's cut reads too). «Mercato da {mmm YYYY}» → the TWR on the block's own window (`signed-percent`, two decimals, the verdict's «+7,96%») → opens `prev-rendimento`; «Datore nel {Y}» → `employerInYear` (`currency`) → `prev-versato`, `null` «nessun versamento» at zero; «Fisco nel {Y}, circa» → `taxSaving` (`currency`) → `prev-anno-fiscale`, `null` «senza RAL» without a RAL, «fondo non assegnato» without a tax recap (an unassigned fund: the employer cell says it too), and at a saving of zero «nessun versamento» only when the year has no contribution, «solo TFR» when it has contributions but none deductible (the Versato row beside lists that year's TFR; owner, 2026-10-16), «nessun beneficio» with a deductible that saves nothing (a RAL under the no-tax area) — never a zero: the verdict DROPS the clause of an empty cause. Changing the year recomputes «Datore» and «Fisco» from the same blocks; «Mercato da …» does not move (off the axis); no row opens or closes. Not measured, two or more contributors, a failed read (the page passes `[]` then): no strip. Each cell prints EXACTLY what the verdict's clause prints (`__tests__/pensionSummary.test.ts` holds the identity) — a TWR that prints as zero included: «0,00%», unsigned and uncoloured, in the cell AND in the sentence (`signedPct` on `printedSign`, the printed-zero rule of AGENTS.md § Layout and Color Tokens, since 2026-10-16; until then the sentence read «+0,00%» green, or «−0,00%» red on float noise). The market cell is off the axis: its value is the same whatever fiscal year is shown (asserted).
- **Lifted blocks**: none — `FondoOggiTile` takes no `liftedFigures` and no cell of `selectPensionStrip` carries `lifts`: each cell opens a row (Rendimento, Versato, Anno fiscale), never THE tile.
- **The rows and their aside, in DOM order** (`PENSION_SECTIONS` and `resolvePensionSections({ hasFund, contributionsError, snapshotsError })` in `pensionSummary.ts` since 2026-10-16, ids `PENSION_SECTION_IDS` there too, the words `PENSION_CLOSED_ASIDES` in `pensionNarrative.ts`): `prev-rendimento` the window (`describeRendimentoAside`: «nov 2025 → ago 2026», «non ancora misurabile», «una finestra per contribuente») · `prev-anno-fiscale` «beneficio e plafond» (not the RAL: an amount) · `prev-versato` «per natura» · `prev-versamenti` the count (`describeVersamentiAside`: «4 versamenti» — a count, never a figure). All closed on a first visit (the memory, below). `TILE_ROW_CELL_CLASS` on their cells, `PageRest` right after THE tile's cell. Without a fund (the empty state) there is no row, no `PageRest`, and the controller knows none (`hasFund` false; until 2026-10-16 the four rows were known there).
- **`binding` clauses and the `scope`**: none — `buildPensionVerdict` flags no segment `binding`, and the page passes no `scope` to `PageVerdict` (the fiscal year is its `axis`, above).
- **The cut** (`buildPensionVerdict`): with ONE measured block **title only** (`leadLength: 0`, the declared deroga: the one sentence would reprint the three cells), «Il perché · le tre cause» holds the whole sentence, where it may repeat the figures (The Lifted-Figure Rule). With two or more contributors the whole verdict and no strip (2026-10-10: the sentence of the one who lost ground never ends behind a tap); without a strip nothing is cut.
- **Absences**: loading — any of the four reads (assets, settings, contributions, snapshots) — is `TileGridSkeleton`; a failed read of the assets or the settings is ONE `ErrorNotice` for the whole page (without them the page does not know whether a fund exists); nothing recorded (no fund) is the verdict over one «Il fondo oggi» tile pointing to Patrimonio («Vai a Patrimonio»), no row, no strip, no `PageRest`. A failed read of the contributions or the snapshots is a row's: the four `ErrorNotice` take `collapse` and `live={!sections.compact}`, and the `SectionSpec`s carry `failed` (`resolvePensionSections`: Rendimento on `contributionsError || snapshotsError`, the other three on `contributionsError`) — open on every visit until closed, red eyebrow when closed, `PageRest`'s one live node. The verdict is the load-error one (`buildPensionLoadErrorVerdict`) and the strip is empty. **Proved in Vitest only** (`__tests__/pensionSummary.test.ts` holds the mapping since 2026-10-16 — until then `resolvePensionSections` was private to the component and nothing pinned it, though the guide said so; the load-error verdict is `pensionNarrative.test.ts`'s): a Firestore read from the client SDK cannot be made to fail by a spec.
- **The memory**: `mobile-sections:pension`, per device and browser, not per account; absent or unreadable → the page's defaults, every row closed (no `defaultOpen`). «Il perché» is remembered as the row `perche`; a failed row opens on every visit whatever the memory says, until closed.
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`, `useTabletComposition` + `useTabletStage`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage — the tablet's spec, retired on 2026-10-16, is in `git log -- doc/mobile/`): at 768 two columns — Il fondo oggi on both, «Il resto» on a row of its own, Rendimento beside Anno fiscale and Versato beside Versamenti, an open row (a failed read, open on its own) whole. **On a tablet in landscape** (a content box ≥ 880px below 1440: 936 at 1024×768 beside the icon rail) the page is a STAGE: on the left the short verdict (the title, the axis, «Il perché», the strip on one row) and Il fondo oggi under it, 16px apart, both sticky while the page scrolls when the left stack fits the screen, the tile reaching the fold; on the right the 360px INDEX, ONE card with «Il resto» and the four rows flat under hairlines, each opening in place, at least as tall as the left stack. Without a fund there is no row and no stage. At 768 the first closed row ends 9px under the pill on the fixture (recorded `false` with its `raisedBy` on 2026-10-16, doc/guide/prima-schermata-misure.md); in landscape it is above `main`'s bottom.
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, landscape only, since 2026-10-16; `describePensionClosedAnswers({ blocks, versato, ledger, contributionsError, snapshotsError })` in `pensionNarrative.ts`, through `RowAnswers`; a `null` keeps the aside — and a failed read keeps its red notice: Rendimento null on either error, the other three on `contributionsError`):
  - Rendimento: «guadagno {±€}» / «perdita {−€}» — the ONE block's market gain in cents, signed and toned on the printed value («0,00 €» unsigned after «guadagno»), never the TWR (the strip's); null with two or more blocks or a return not measured.
  - Anno fiscale: «restano {€}» (the deductible headroom, whole euro) or «oltre il tetto {€}» past it; null with two or more blocks or a fund linked to no member.
  - Versato: «{nature} {%}» (the largest nature's share, rounded); null on a year with nothing paid.
  - Versamenti: «ultimo il {day month}» / «il {day month}» with one contribution (the latest's day in words); null on an empty year.
- **The Rendimento tile signs on the printed figure** (2026-10-16, a defect found writing the closed rows' answers): its TWR, «Guadagno di mercato» and «Ritorno sul tuo capitale» take `formatSignedPercentIt` / `formatSignedEuro` and a tone on `printedSign` — a TWR of −0,004 printed «−0,00%» red under the strip's «0,00%» until then (`__tests__/pensionRendimentoTile.test.ts`).
- **The specs**: `e2e/pension.mobile.spec.ts` (`mobile`, the base account with `scripts/seedPensionE2E.mts`: the axis inside the verdict, the three cells on Marco's measured return, title only with the sentence behind «Il perché», the rows closed in the DOM's order, Versamenti opened before its delete targets are measured, no overflow with the rows open), `e2e/pension.spec.ts` (1440: no `-trigger`, the strip hidden, the whole sentence, one visible axis beside the verdict — seen red on 2026-10-16 with `useCompactLayout` forced true). In Vitest the strip and the rows are `__tests__/pensionSummary.test.ts`'s, the closed rows' answers and the load-error verdict `__tests__/pensionNarrative.test.ts`'s; the first screen is the `previdenza` surface of `perf/mobile-budget.json` (`npm run mobile:budget`).

## Per-page blind spots

- **Previdenza**: a contribution can be deleted but not edited — a wrong amount is a delete (which reverses the cash
  transfer) plus a re-entry, because the service has no update path and an in-place edit of a voluntary row would
  have to re-reconcile the transfer (left open on 2026-09-13, from the critique's P2); «Aggiorna valore» in demo is
  disabled like every write; a contribution the fund credits late reads as a temporary market loss in the month it is recorded (the window's total heals once credited and the value updated — by design, → *Fondo Pensione*); the sparkline starts where the snapshots carry `byAsset`; the month chip needs the previous month's snapshot; two contributors stack one block per person; the IRPEF saving uses the default brackets; the dialog keeps its old chrome; **the contradictory guard covers the WINDOW's return only** (2026-09-07): the month chip of «Il fondo oggi» (`monthEffect`), the Panoramica's market digest and Rendimenti's per-instrument attribution all read `Δvalue − contributions moved that month` for a single month without it, so the same backfilled contributions print a −2.250 € «market» effect for that month on those three surfaces — a month, not a return, and said as such nowhere yet.
