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
  editor — «Crea un PAC con questi pesi» in the model's dialog, «Apri l'editor» in «Dal Consulente» (below) — arrives as ONE `PlanSeedDraft` (`positions`,
  `disposals?`, `optimizerSnapshot?`, 2026-11-17), never a second seed shape. «Con vendite mirate» seeds its
  `disposals` (`seedDisposalsFromSale`, 2026-11-18): the whole position of an instrument out of the model or brought
  to 0% (`soldOutKeys`: never one merely out of the model, like a money-market fund — found at the tour), and then no
  position; whole shares
  (never the last) of one kept, `estimatedProceedsEur` in cents; never the liquidity nor a property.
- **A money-market fund may be SOLD, never bought** (`isPlanCashFund`, owner 2026-11-18): a disposal, never a
  position. Its sale only moves cash onto the accounts, so the reserve rises by it (`planCashFundSaleEur` →
  `resolvePlanReserve(…, cashFundSoldEur)` → `resolveAccountReserveEur`): only the euros above the quota become the
  plan's. The editor's reserve is proposed with the seeded sales; a money-market sale comes from «Con vendite mirate»
  only — no code path adds it by hand at step 2 (`listAddableAssets` reads `isPlanBuyable`; corrected 2026-11-19).
  `resolvePlanReserve` takes an optional last `sourceIds` (2026-11-19): given, its accounts' sum reads those
  accounts only and the cash on the others counts as outside the plan — the Consulente's plan stage passes the
  investment account; absent, the function is unchanged.
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
  count only the months that buy (`countPlanInstalments`), and a closed plan's planned euros subtract the gap. So does «Questo mese»'s
  aside (owner, 2026-11-19, the rule kept): «rata k di n» over the months that buy, «dicembre 2026 · solo riserva, prima rata a
  febbraio» on a refill month (`locateOpenMonth`); the calendar reads «Solo riserva» on it (`describeInstallmentStatus`, never
  «Registrato»), and the months bar never fills it (`isInstalmentClosed`).
- **A sale counts from its month** (owner, 2026-11-19). `PlanDisposal.monthIndex` is an absolute month of the plan
  (absent = 1, `disposalMonthIndex`); `computeUsableLiquidity(…, firstIndex)` returns `dueProceedsEur` (the sales of
  the first scheduled month, spent at once) and `monthShares` (`spreadMonthShares`), and `scheduleInstallments(…,
  refillMonths, monthShares)` lets the proceeds enter the instalments from their month. A later sale first refills
  what is still missing of the reserve, so `L` does not depend on the months. When no month buys, the residual is the
  whole `L` (owner, 2026-11-19: it read 0 before). The editor puts «Vendi a» on every open sale, whole or partial
  (the partial one since the tour, owner 2026-11-19: a new quantity keeps the month), a sale added in a revision
  starts at the first revised month (a saved open sale with no month is not moved), and the schema refuses a month past the last instalment (`sale_month_out`). The
  side panel splits «vendite al mese 1» from «vendite nei mesi successivi» and says each month a sale raises the
  instalment («Da febbraio la rata sale a 1800 €: entra il ricavato di …», `listSaleSteps` → `describeSaleStep`,
  repeated at the top of step 3); the reserve note names the sales that refill it with the inflows
  (`listRefillSaleMonths`: «la ricostituiscono le entrate fino a gennaio e la vendita di febbraio»); step 3's reading
  and the panel count only the months that buy (`summarizeBuyingInstalments`: «10 rate: in media … ; la prima,
  febbraio, …»). Step 2's «Al mese» stays the even average, «Da comprare» ÷ the months (owner, 2026-11-19: the true
  figures are the side panel's, the first instalment and the sale-step sentences). The matcher's `upcoming` state: a sale
  of a later month reads «In programma · feb 2027» with no «Registra»; a ledger sale made before it is «Da
  confermare», and «Ignora» brings it back to `upcoming`.
- **The default source account** (owner, 2026-11-19): Impostazioni › Spese › «Conto per gli investimenti»
  (`AssetAllocationSettings.investmentCashAssetId`, doc/guide/impostazioni.md); `resolveInvestmentAccountId` ticks it
  on a new plan while it is still a plan source account (`isPlanSourceAccount`), and nothing when it is gone.
- **The review month** (owner, 2026-11-19): a plan may carry `reviewMonthIndex`, the plan month the Consulente asks
  to look at it again — no app path writes it yet on 2026-11-19 (the Consulente's operating plan is to); in that month
  «Questo mese» shows `ACCUMULO_REVIEW_DUE_NOTE` with «Rivedi il piano» (`isPlanReviewDue`), and a revision saved in
  the month hides the note (the field stays); editing a draft keeps it (`draftFromPlan` copies it), a revision keeps,
  replaces or clears it (`PlanRevisionInput.reviewMonthIndex`: absent, a number, `null`).
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

## Dal Consulente

The plan toward the targets «Applica» just wrote (owner, 2026-11-12; in `develop` since 2026-11-18, PR #553). The «Applica» page
links to `?tab=accumulo&da=consulente` (`CONSULENTE_HANDOFF_HREF`) when the document is applied with the targets
written and no plan is open (`applyHandoffOf`); the tab opens «Dal Consulente» once, only then, and cleans the URL
whatever it finds (a failed read of the advice is «no advice»). No model is called: the weights are the app's.

- **Matching** (`planConsulenteHandoff`, `lib/utils/allocationAdviceHandoff.ts`, pure): per sub-target (a class
  without sub-targets reads its first sleeve under the class's label), the instrument the sub-target names wins over
  the search's order; an asset is found by name, then by ISIN («Nome (ISIN)»), then by the candidate's ISIN, name,
  ticker. `cash` and `realestate` are skipped; a matched asset the plan cannot buy (`isPlanBuyable`: an account, a
  property, a loan, a non-tradable role) is «Fuori dal piano»; a name with no asset is a row to create, its
  `AssetPrefill` carrying name, ticker (often `''`), ISIN, type (`bond` for an IT/XS ISIN without ticker, `crypto` in
  crypto, else `etf`) and the sub-target as sub-category. The interview's «da tenere» join the kept ids.
- **The seed** (`buildHandoffSeed`; the hand-off still seeds from the optimizer, not from the Consulente's
  operating plan, doc/guide/consulente-piano.md — 2026-11-19; the plan's own `sourceIds` reserve is in § Rules): `runOptimizer` in mode `'ideal'` on the proposal's targets and the owner's
  criteria (`DEFAULT_IDEAL_ALLOCATION` without them), with a factor objective at `'high'` added per class with
  sub-targets the owner did not list (`handoffCriteria`) — not for a class whose instruments carry a sub-category the
  targets do not name (`unmappedClasses`: the objective would push them toward 0). **The seed holds every tradable
  instrument held**, named by the Consulente or not; **one the Consulente did not name is a row at 0 %** — the plan
  stops buying it and sells nothing — once a named instrument that can take its share is among the assets (its
  sub-target; a sub-category the targets do not list, or a class without sub-targets: any named one of the class);
  until then it holds the place, so the share does not fall on the class's other instruments (`unnamedHeld`,
  `extraNames`, `describeHandoffExtra`; owner 2026-11-18, phase F: before, the plan kept buying it); **a new instrument in a
  class without sub-targets starts at 0 %** — its bounds are fixed at 0 (`startsAtZero`, owner 2026-11-12 and
  2026-11-18: with the first code the optimizer still gave it a share alone in its class, so «parte da 0%» never
  fired) and the reading names the class (`zeroClasses`, `describeHandoffZero`) — only for an instrument with no value yet: a held one the optimizer leaves at 0 % is a row at 0 % and no sentence (phase F, 2026-11-18). A property under its mortgage
  (`negative_fixed`), bounds that cannot hold or nothing matched fall back to `manual`: the matched instruments at 0 %,
  and the reading says why. The snapshot's clock is the dialog's opening.
- **Three views of ONE state** (`components/allocation/ConsulenteHandoff.tsx`): the hand-off, `AssetDialog` for one
  «Crea» (`createEmpty` + `prefill`, step 2), the editor (`seedDraft`, `advisorKeepAssetIds`) — never two modals. A
  row just created reads «creato, in aggiornamento» and offers no second «Crea» until the assets' re-read moves it
  among the matched («0 quote»). «Apri l'editor» is off with no position.
- **The editor keeps the model checkbox's default** (on when the plan differs from the model), and «Salva bozza»
  writes the model when it is on (owner, 2026-11-18, every plan: the spec's § 7 D expected it, the editor wrote it
  only on «Attiva»; `e2e/accumulo.consulente.spec.ts` E4). With
  `advisorKeepAssetIds`, a month-1 sale of a kept instrument is named on steps 2 and 3 (`KeptSalesNote`,
  `findKeptSales`, `describeKeptSales`); everywhere else the prop is absent and nothing renders.

## Composizione mobile

Below `desktop:` the tab follows the shared small-screen composition (DESIGN.md → Small-Screen Composition):
verdict cut after the first sentence («Il perché · il rientro nella banda» closed), a strip of three cells
(Rata · Investito · la classe più lontana dalla banda, or «tutte in soglia»), THE tile **Questo mese** open, and
«Il resto della pagina» with closed rows in DOM order: **Classi del piano** and, when one exists, **Piani conclusi**.
Memory key `mobile-sections:allocation:accumulo` (the tab's own, not Bilanciamento's). At 768 two columns; in
landscape the stage and the icon rail. At 1440 nothing changes: two columns, no rows. **The two columns end on one line** (owner, 2026-11-18, as Bilanciamento's Piano and Per classe): the model's cell has no `desktop:self-start` and fills the `1fr` row to the right box's bottom edge; when the model's column is the taller, the box's last tile, Criteri del modello, grows (`desktop:flex-1`); without a plan the box takes the model's row alone (no `row-span-2`). Held by `e2e/accumulo.spec.ts` › «le due colonne finiscono sulla stessa riga», seen red at 82 and 145 px. With no row (no plan) there is no index and no stage: the grid of before, the empty tile across the page at every width (`PLAIN_GRID_CLASS`, `leadCellClass`; 2026-11-17, `e2e/accumulo.tablet.spec.ts`).

## Files

`types/accumulationPlan.ts` · `lib/utils/{accumulationPlanUtils,accumulationPlanMatching,accumulationPlanSchema,accumulationNarrative,accumuloSummary,zeroQuantityChip}.ts` · the slim read path `lib/utils/{openAccumulationPlan,planMonths,accumulationPlanDoc,accumuloMonth}.ts`, `lib/services/accumulationPlanRead.ts`, `lib/hooks/{useAccumulationPlans,usePacMonth}.ts` · `lib/services/accumulationPlanService.ts` (the transactions and the lock) · `lib/hooks/{useAccumulationPlan,useOpenAccumuloPlan,useMonthlySavingsMedian}.ts` · `components/allocation/{AccumuloTab,AccumuloTabSkeleton,AccumulationPlanDialog,AccumulationCalendarDialog,ClassDriftChart,PlanDraftSidePanel,ConsulenteHandoff,KeptSalesNote}.tsx` · the Consulente's hand-off `lib/utils/allocationAdviceHandoff.ts` (tests `allocationAdviceHandoff`, `consulenteHandoff`, `keptSalesNote`, `e2e/accumulo.consulente.spec.ts`) · `components/allocation/tiles/{QuestoMese,ClassiDelPiano,AccumuloVuoto,PianiConclusi}Tile.tsx` · tests `__tests__/accumul*.test.ts`, `__tests__/{questoMeseTile,accumulationPlanDialogSaleMonth}.test.tsx`, `e2e/accumulo.{mobile,tablet}.spec.ts` (fixture `e2e/accumuloFixture.ts`).

- **Suites to run after a change here — Accumulo** (2026-11-17; the Consulente's hand-off since 2026-11-18): `accumulationPlanUtils`, `accumulationPlanMatching`,
  `accumulationPlanSchema`, `accumulationPlanDoc`, `accumulationPlanService`, `accumulationPlanRevision`,
  `accumulationPlanReviewFlow`, `accumulationClassTrajectory`, `accumulationNarrative`, `accumulationReactivate`,
  `accumuloMonth`, `accumuloSummary`, `accumuloTileSentences`, `zeroQuantityChip`, `allocazioneNarrative`,
  `allocazioneSummary`, `mirrorCollections`, `persistCache`, `allocationAdviceHandoff`, `allocationAdviceDocument`,
  `modelPortfolioGroups`, `narrativeTextNesting` · **dom** `accumuloVuotoTile`, `planDraftSidePanel`,
  `assetDialogCreateEmpty`, `strumentiTile`, `consulenteBook`, `consulenteHandoff`, `keptSalesNote`, `questoMeseTile`,
  `accumulationPlanDialogSaleMonth` · **AI context** `assistantPortfolioContext`,
  `assistantPromptBundle`, `allocationAdviceApply`, `allocationAdvicePrompts`, `allocationAdvicePlanRead`, `allocationAdviceRun` · **Browser** `e2e/accumulo.spec.ts`,
  `e2e/accumulo.consulente.spec.ts`, `e2e/accumulo.{mobile,tablet}.spec.ts`,
  `e2e/allocation.spec.ts` (the tab, the Piano's note), `e2e/bundle.lazy.mobile.spec.ts` (the lazy landing).

## Per-page blind spots

- **A sale in a later month makes the first instalments smaller** (2026-11-19): it is the plan not spending money it
  does not have yet, not a bug; below the reserve the months before it may be 0 € («Solo riserva»).
- **The recalibration's cash ceiling never binds once the budgets come from `monthShares`** (2026-11-19): a guard no
  test turns red.
- **A partial sale leaves the position's value from month 0, whatever its month** (2026-11-19, declared):
  `resolvePositionStates` computes the totals once, on the portfolio as the plan will leave it; only the money's month
  moves.
- **A plan saved before 2026-11-19 keeps its stored instalments**: no migration (an absent `monthIndex` is month 1, an
  absent `reviewMonthIndex` none); only a recalibration or a revision recomputes on the sale's month, and a plan whose
  sales are all in month 1 recomputes to the same figures.
- **What the sale's month does not do** (declared on 2026-11-19): the Calendario dialog has no row for the sales (a
  lost link is recovered only by unlinking, in «Questo mese»); `reviewMonthIndex` has no control in the editor, and a hand
  revision keeps it.
- **Query key**: every write (create, revise, interrupt, reactivate, confirm) invalidates `queryKeys.accumulationPlans.all`,
  the one key the tab and the Piano's note both read.
- **«Parti da»** seeds from today's tradable weights, typed targets or, when one is saved, the model portfolio (doc/guide/ottimizzatore.md); on a «superato» model the option stays and the tile's stale sentence shows under it.
- **No tab bar without a Piano**: with no assets, a failed read or no Piano (the page's `loadFailed` and `!hasAssets`
  branches) the page draws no `PageTabs`, so `?tab=accumulo` lands on Bilanciamento's state there — declared on
  2026-11-12, not a bug. The loading branch draws the bar.
- **A class at 0% target is not drawn** (owner, 2026-11-17): `onlyTargetedClasses` takes it out of the editor's panel, the chart, the calendar and the re-entry sentence — Impostazioni saves every class, the empty ones at 0, and «Immobili 78,6% → 0%» squashed the chart. The filter is the VIEWS' only: `projectClassTrajectory` keeps every class, its cash class proves the money conserved (`__tests__/accumulationClassTrajectory.test.ts`).
- **«Mai comprato»** (`describeZeroQuantityChip`) needs `Asset.createdEmpty`, written only by «+ Nuovo asset»: an asset created at 0 before 2026-11-12, or a position sold before the ledger migration, reads «Azzerato».
- **The census fixture plants a plan and its lock** (`scripts/seedCensusE2E.mts`); the `allocazione-accumulo` entry of `perf/mobile-budget.json` is measured on this machine (doc/guide/prima-schermata-misure.md).
- **«Dal Consulente»: a limit bounds the weight in the portfolio, not the quota in the plan** (2026-11-12): an
  instrument's `instrumentLimits` in the criteria hold for the optimizer's portfolio weights, which the seed turns into
  the plan's quotas — a quota above the limit is not a bug.
- **«Dal Consulente»: a held instrument keeps its own sub-category** (2026-11-12): the hand-off never re-labels it to the
  Consulente's sleeve; a sub-category the targets do not list makes its class `unmappedClasses` (the class whole).
- **«Dal Consulente»: dropping the `isPlanBuyable` filter in `buildHandoffSeed` stays green** (2026-11-18):
  `toModelWeights` already drops the money-market fund, the accounts and «Liquidità» — the filter is a guard.
- **«Dal Consulente»: a held instrument that holds the place is not named** (owner, 2026-11-19): until the instrument
  the Consulente names in its slot is created, the held one keeps its share and the reading does not name it —
  `describeHandoffExtra` names only the ones brought to 0 % (`unnamedHeld`); the «Crea» row already says the quotas are
  recomputed. The spec's sentence «Il piano compra anche {nomi}…» was replaced on the tour of 2026-11-18.
- **«Dal Consulente»: what it does not do** (declared on 2026-11-12): a prefilled instrument typed wrongly (`bond` /
  `crypto` / `etf`) is not retyped in the window — created from Patrimonio's «Aggiungi asset», it is matched by name at
  the next open; no sale is seeded from the Consulente's «vendi» (a sale under a tax cap is «Con vendite mirate»,
  doc/guide/ottimizzatore.md); no hand-off from a report not yet applied; an active plan is revised from Accumulo's
  «Rivedi il piano», never from the Consulente; the month-1 warning's wiring in the editor (`KeptSalesNote` on steps 2
  and 3) was proven on the tour, the component alone by `keptSalesNote`.
