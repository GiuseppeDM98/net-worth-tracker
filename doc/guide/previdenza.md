# Previdenza (Fondo Pensione)

> **Quando aprire questa guida** — chi tocca `app/dashboard/pension/page.tsx`, `components/pension/*`, `types/pension.ts`, `lib/utils/pension*.ts`, `lib/services/pensionContributionService.ts`. Esercizio emulatore `scripts/seedPensionE2E.mts`; specs `e2e/pension*.spec.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Previdenza*.

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
- **`isPensionReturnMeasurable` = `!isCoverageSuspicious && !hasNoMovement` is ONE predicate with two consumers.**
  *When two places must agree on whether data is trustworthy, the agreement is a named function.* An annualized return
  above 20% means missing contributions, not a brilliant fund.

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
- **`performanceBase.ts` reads `byAsset`, never `byAssetClass`**, and the exclusion is applied in TWO places because the
  Rendimenti page has two independent snapshot-fetch paths.

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
  clause — never folded into someone else's RAL. `returnState` (`measured` · `suspicious` · `idle` ·
  `no-contributions` · `one-point`) is the one discriminator the verdict, the tile and the Dettaglio read; when it is
  not `measured` the percentage is replaced by the reason everywhere, and «Da dove viene la crescita» is absent.
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
- The ledger's delete is `useArmedDelete` (two clicks, no timer, announced on arm and disarm); the 3 s auto-disarm of
  the old chapter is gone. Playwright locates the tiles by `role=region` + `aria-label` («Il fondo oggi»,
  «Rendimento del fondo», «Anno fiscale» with `exact: true` — it is a prefix of «Anno fiscale 2026» nowhere, but
  «Versamenti» IS a prefix of the delete buttons' names), the verdict by «Verdetto sul fondo pensione», the axis by
  the tablist «Anno fiscale», the disclosure by `/^Dettaglio/`. The base fixture (`scripts/seedPensionE2E.mts`) runs
  in whatever month: assert the cumulative TWR («+3,48%») and the structure, never the annualised figure.

## Per-page blind spots

- **Previdenza**: a contribution the fund credits late reads as a temporary market loss in the month it is recorded (the window's total heals once credited and the value updated — by design, → *Fondo Pensione*); the sparkline starts where the snapshots carry `byAsset`; the month chip needs the previous month's snapshot; two contributors stack one block per person; the IRPEF saving uses the default brackets; the dialog keeps its old chrome.
