# Previdenza (Fondo Pensione)

> **Quando aprire questa guida** — chi tocca `app/dashboard/pension/page.tsx`, `components/pension/*`, `types/pension.ts`, `lib/utils/pension*.ts`, `lib/services/pensionContributionService.ts`. Esercizio emulatore `scripts/seedPensionE2E.mts`; specs `e2e/pension*.spec.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Previdenza**: `types/pension.ts`, pure `lib/utils/{pensionSummary,pensionNarrative}.ts` over `lib/utils/{pensionDeduction,pensionContributions,pensionReturn,pensionFire,pensionFamilyMembers}.ts` (`indexPensionSnapshots` = the snapshots reduced ONCE to the funds; `isPensionValueStale` = the ONE age of a hand-kept value), `lib/services/pensionContributionService.ts` (`assertFundValueLivesInQuantity`, `updatePensionFundValue`), `app/dashboard/pension/page.tsx`, `components/pension/*` (`PensionValueDialog`, `pensionStyles.ts`); the two modals' words in `lib/utils/dialogNarrative.ts`; collection `pensionContributions`

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
- **The year axis sits beside the verdict** (Tracciamento's shape) and governs the verdict's two annual clauses,
  «Anno fiscale», «Versato nel {Y}» and «Versamenti {Y}»; «Il fondo oggi» and «Rendimento» are OFF it and name their
  own window in the aside («oggi», «nov 2025 → ago 2026»). The month digest of the hero (`monthEffect`) is measured
  exactly as the Panoramica's «Previdenza» line — live value − the previous month's snapshot − contributions
  recorded since (`valueEffectMonth`), null when the previous month has no snapshot with the fund or the window
  starts later — so the two pages never disagree on a number.
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

## Per-page blind spots

- **Previdenza**: a contribution can be deleted but not edited — a wrong amount is a delete (which reverses the cash
  transfer) plus a re-entry, because the service has no update path and an in-place edit of a voluntary row would
  have to re-reconcile the transfer (left open on 2026-09-13, from the critique's P2); «Aggiorna valore» in demo is
  disabled like every write; a contribution the fund credits late reads as a temporary market loss in the month it is recorded (the window's total heals once credited and the value updated — by design, → *Fondo Pensione*); the sparkline starts where the snapshots carry `byAsset`; the month chip needs the previous month's snapshot; two contributors stack one block per person; the IRPEF saving uses the default brackets; the dialog keeps its old chrome; **the contradictory guard covers the WINDOW's return only** (2026-09-07): the month chip of «Il fondo oggi» (`monthEffect`), the Panoramica's market digest and Rendimenti's per-instrument attribution all read `Δvalue − contributions moved that month` for a single month without it, so the same backfilled contributions print a −2.250 € «market» effect for that month on those three surfaces — a month, not a return, and said as such nowhere yet.
