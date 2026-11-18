# Allocazione › Accumulo (PAC)

*The question it answers: «il mio piano di accumulo sta funzionando, e cosa compro questo mese?»* A second tab of
Allocazione (`?tab=accumulo`) next to Bilanciamento. A plan splits a monthly inflow over instruments by target
weight, month by month, proposes the purchases and never writes a transaction on its own.

## Rules

- **One draft-or-active plan per account**, stored in `accumulationPlans/{id}` (`userId` = the owner). The lock
  `accumulationPlanLocks/{ownerUid}` (`openPlanId`) is written in the plan's own transaction — create, close, delete,
  reactivate — so two concurrent creations leave one plan (2026-11-12; a client transaction cannot query, hence the
  lock document). A lock naming a plan that no longer exists reads as free: the plans' read rule allows a missing
  document (`resource == null`). Both rules are in `firestore.rules` and **must be published by hand** (`npx firebase
  deploy --only firestore:rules`); until then the tab cannot read the collection. Published by the owner before
  2026-11-17, ahead of any deploy (additive: two new collections); no migration, no plan existed in production.
- **A plan is a list of positions** (a label, a target weight, the member instruments and the one that BUYS,
  `buyAssetId`). Weights sum to 100. «Parti da» seeds them from today's tradable portfolio or from typed targets.
  Step 2 also has an «Ottimizzato» view (`OptimizerPanel`, doc/guide/ottimizzatore.md): it runs on «Calcola» only and
  «Usa questi pesi» hands the weights and the calculation's snapshot to the draft. A plan started from outside the
  editor — «Crea un PAC con questi pesi» in the model's dialog — arrives as ONE `PlanSeedDraft` (`positions`,
  `disposals?`, `optimizerSnapshot?`, 2026-11-17), never a second seed shape.
- **The engine is pure** (`lib/utils/accumulationPlanUtils.ts`): `scheduleInstallments` lays the months, `matchPlanExecutions`
  (`accumulationPlanMatching.ts`) pairs the registry's BUY transactions with the planned lines, a late month carries
  its shortfall into the next. Sentences live in `accumulationNarrative.ts` and `accumuloSummary.ts`, never in a
  component.
- **The reserve is the allocation's cash quota, and it is refilled before anything is bought** (owner, 2026-11-17).
  The quota (`resolvePlanReserveEur`: the cash target's fixed amount, or its percentage of today's allocated base
  rounded up to the euro) covers the whole cash class, a money-market fund too, while a plan spends only from the
  accounts — the sources are the real accounts only (`isPlanSourceAccount`, the editor lists nothing else): a new plan's «Riserva da non toccare» starts from the quota minus the cash held outside the accounts
  (`resolvePlanReserve` → `resolveAccountReserveEur`) and stays editable. The empty tile and the no-plan verdict print
  the whole cash class against the quota («Nella liquidità hai X €, entro la quota dell'allocazione (Y €)»). When
  the source cash is below the reserve, the sales and then the monthly inflows bring it back first:
  `computeUsableLiquidity` returns `shortfallEur` and `refillMonths`, `L` = cash above the reserve + max(0, sales +
  inflows − shortfall), and `scheduleInstallments(…, refillMonths)` leaves those first months empty and spreads `L`
  over the rest, so the cash never falls under the reserve (each instalment ≥ the inflow). A month with no line is the
  verdict state `quiet` («A gennaio le entrate riportano la liquidità alla riserva: la prima rata è a marzo.»), the
  Piano gets no note, «Questo mese» says why (`describeQuietMonthReading`); the editor's step 1 and side panel show
  the refill (`describeRefillNote`); the recalibration's cash ceiling is the cash above the reserve + the sales + THIS
  month's inflow − the shortfall (the inflow counted as the calendar counts it, owner 2026-11-17: without it a plan
  just revised proposed «prezzi cambiati» with the prices still), and a refill month proposes no recalibration. A month with no line is not an instalment: «n di m rate chiuse» and a closed plan's row
  count only the months that buy (`countPlanInstalments`), and a closed plan's planned euros subtract the gap.
- **«Registra» opens `TransactionDialog` prefilled** from the planned line and links the transaction on save
  (`onCreated`); an instrument with no asset yet is created from «+ Nuovo asset» (`AssetDialog`, `createEmpty`).
- **«Rivedi il piano»** rewrites the months from the first intact one; closed installments keep their lines
  (`buildRevisedPlan`). **«Riattiva»** reopens a plan interrupted under 30 days ago while none is open.
- **With an active plan the Bilanciamento verdict does not change**; the Piano opens with one note and «Apri Accumulo»
  (`describePacOverlap`, `findPacSubstitutions`; owner, 2026-11-12).
- **A plan not started yet** (its first month after today) is the verdict state `scheduled` («Il piano parte a …:
  prima rata di X € in n acquisti[, a <the first month that buys>].»), with no strip, and the Piano shows no note (`summarizePacMonth` is null before
  month 1, `lib/utils/accumuloMonth.ts`).
- **A plan buys only what «Registra» can write**: `isPlanBuyable` — a ledger type, role tradable resolved WITH the
  asset it finances (`resolveAllocationRoleWithin`), not a cash-class fund. «+ Aggiungi», the seeded positions, the
  draft's validation and the empty tile's preview read this one predicate.
- **Every euro field is rounded once, at the service boundary** (`roundPlanEuros` in `accumulationPlanService.ts`);
  the engine rounds what it records and keeps the month-to-month carry exact, so the plan's total is kept to the cent.
- **The suggested instalment is the median of the monthly savings** over the last full months (3 to 12, the
  cashflow block's `volatility.savings.median`, `useMonthlySavingsMedian`), floored to the ten; none under three
  months or on a failed read (owner, 2026-11-12: the median, never annual savings / 12). The expenses are FIRE's `recent` window, read only while the editor's
  first step or the empty tile is on screen.
- **The review date**: when the plan would end after the Consulente's «rivedi entro», «Questo mese» and the editor's
  preview say so in one note (`planEndsAfterReview`, `describePlanPastReview`).
- **The tab is loaded on demand** (`lazyComponent` in the page, preloaded when idle); its fallback is its own loading
  state, `AccumuloTabSkeleton` (`e2e/lazyTabLanding.ts` holds the landing). The Piano's note reads through slim
  modules so the page imports none of the editor, and even those arrive on demand (2026-11-17, doc/guide/velocita.md
  § Registro): `useAccumulationPlans` imports `accumulationPlanRead` (and `accumulationPlanDoc`) inside its query,
  `usePacMonth` imports `accumuloMonth` (and `planMonths`) once a plan is active, `selectOpenPlan` lives alone in
  `openAccumulationPlan.ts`; the plans' key is persisted (`PERSISTED_QUERY_PREFIXES`).
- **The page's money is in euros of the month**: the installment is ONE figure («Rata di ottobre»); the average is
  named only in the editor (`describeInstallmentAverage`).

## Composizione mobile

Below `desktop:` the tab follows the shared small-screen composition (DESIGN.md → Small-Screen Composition):
verdict cut after the first sentence («Il perché · il rientro nella banda» closed), a strip of three cells
(Rata · Investito · la classe più lontana dalla banda, or «tutte in soglia»), THE tile **Questo mese** open, and
«Il resto della pagina» with closed rows in DOM order: **Classi del piano** and, when one exists, **Piani conclusi**.
Memory key `mobile-sections:allocation:accumulo` (the tab's own, not Bilanciamento's). At 768 two columns; in
landscape the stage and the icon rail. At 1440 nothing changes: two columns, no rows. With no row (no plan) there is no index and no stage: the grid of before, the empty tile across the page at every width (`PLAIN_GRID_CLASS`, `leadCellClass`; 2026-11-17, `e2e/accumulo.tablet.spec.ts`).

## Files

`types/accumulationPlan.ts` · `lib/utils/{accumulationPlanUtils,accumulationPlanMatching,accumulationPlanSchema,accumulationNarrative,accumuloSummary,zeroQuantityChip}.ts` · the slim read path `lib/utils/{openAccumulationPlan,planMonths,accumulationPlanDoc,accumuloMonth}.ts`, `lib/services/accumulationPlanRead.ts`, `lib/hooks/{useAccumulationPlans,usePacMonth}.ts` · `lib/services/accumulationPlanService.ts` (the transactions and the lock) · `lib/hooks/{useAccumulationPlan,useOpenAccumuloPlan,useMonthlySavingsMedian}.ts` · `components/allocation/{AccumuloTab,AccumuloTabSkeleton,AccumulationPlanDialog,AccumulationCalendarDialog,ClassDriftChart,PlanDraftSidePanel}.tsx` · `components/allocation/tiles/{QuestoMese,ClassiDelPiano,AccumuloVuoto,PianiConclusi}Tile.tsx` · tests `__tests__/accumul*.test.ts`, `e2e/accumulo.{mobile,tablet}.spec.ts` (fixture `e2e/accumuloFixture.ts`).

- **Suites to run after a change here — Accumulo** (2026-11-17): `accumulationPlanUtils`, `accumulationPlanMatching`,
  `accumulationPlanSchema`, `accumulationPlanDoc`, `accumulationPlanService`, `accumulationPlanRevision`,
  `accumulationPlanReviewFlow`, `accumulationClassTrajectory`, `accumulationNarrative`, `accumulationReactivate`,
  `accumuloMonth`, `accumuloSummary`, `accumuloTileSentences`, `zeroQuantityChip`, `allocazioneNarrative`,
  `allocazioneSummary`, `mirrorCollections`, `persistCache` · **dom** `accumuloVuotoTile`, `planDraftSidePanel`,
  `assetDialogCreateEmpty`, `strumentiTile`, `consulenteBook` · **AI context** `assistantPortfolioContext`,
  `assistantPromptBundle`, `allocationAdviceApply`, `allocationAdvicePrompts` · **Browser** `e2e/accumulo.{mobile,tablet}.spec.ts`,
  `e2e/allocation.spec.ts` (the tab, the Piano's note), `e2e/bundle.lazy.mobile.spec.ts` (the lazy landing).

## Per-page blind spots

- **Query key**: every write (create, revise, interrupt, reactivate, confirm) invalidates `queryKeys.accumulationPlans.all`,
  the one key the tab and the Piano's note both read.
- **«Parti da»** seeds from today's tradable weights, typed targets or, when one is saved, the model portfolio (doc/guide/ottimizzatore.md); on a «superato» model the option stays and the tile's stale sentence shows under it.
- **No tab bar without a Piano**: with no assets, a failed read or no Piano (the page's `loadFailed` and `!hasAssets`
  branches) the page draws no `PageTabs`, so `?tab=accumulo` lands on Bilanciamento's state there — declared on
  2026-11-12, not a bug. The loading branch draws the bar.
- **A class at 0% target is not drawn** (owner, 2026-11-17): `onlyTargetedClasses` takes it out of the editor's panel, the chart, the calendar and the re-entry sentence — Impostazioni saves every class, the empty ones at 0, and «Immobili 78,6% → 0%» squashed the chart. The filter is the VIEWS' only: `projectClassTrajectory` keeps every class, its cash class proves the money conserved (`__tests__/accumulationClassTrajectory.test.ts`).
- **«Mai comprato»** (`describeZeroQuantityChip`) needs `Asset.createdEmpty`, written only by «+ Nuovo asset»: an asset created at 0 before 2026-11-12, or a position sold before the ledger migration, reads «Azzerato».
- **The census fixture plants a plan and its lock** (`scripts/seedCensusE2E.mts`); the `allocazione-accumulo` entry of `perf/mobile-budget.json` is measured on this machine (doc/guide/prima-schermata-misure.md).
