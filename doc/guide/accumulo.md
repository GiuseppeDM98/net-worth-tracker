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
  `buyAssetId`). Weights sum to 100. A plan is CREATED by the guided path (§ Creare un piano: il percorso); the
  editor only revises («Rivedi il piano»), where «Parti da» seeds them from today's tradable portfolio or from typed
  targets. Step 2 also has an «Ottimizzato» view (`OptimizerPanel`, doc/guide/ottimizzatore.md): it runs on «Calcola» only and
  «Usa questi pesi» hands the weights and the calculation's snapshot to the draft. A plan started from outside the
  editor — «Crea un PAC con questi pesi» in the model's dialog — arrives as ONE `PlanSeedDraft` (since 2026-11-20 the
  path's browser draft) (`positions`,
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
  accounts — the sources are the real accounts only (`isPlanSourceAccount`, the path and the editor list nothing else): the path's «Riserva» starts from the quota minus the cash held outside the TICKED accounts
  (`resolvePlanReserve(…, sourceIds)` → `resolveAccountReserveEur`) and stays editable; the revision's «Riserva da non
  toccare» keeps the editor's rule, without `sourceIds`. The empty tile and the no-plan verdict print
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
  febbraio» on a refill month (`locateOpenMonth`), the year added once the first instalment is 12 months away or more
  («prima rata a febbraio 2028», 2026-11-20); the calendar reads «Solo riserva» on it (`describeInstallmentStatus`, never
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
- **The swap** (owner, 2026-11-20, found on the mirror tour: «vendi due ETF e con il ricavato compra il BTP€i» put
  the proceeds in the reserve, and the BTP€i was bought in pieces from the first rata). `PlanDisposal.reinvestAssetId`
  names the asset of a position the sale buys at once (`swapTargetOf`: open, a priced target that is a position's
  `buyAssetId`, never the sold asset — the schema's `swap_target` otherwise). Its proceeds stay out of the pool, the
  refill and `L` (`computeUsableLiquidity` → `swapProceedsEur`, `swaps`); `resolvePositionStates` counts them in the
  bought position's value, so the rates do not buy it again. `scheduleInstallments(…, swaps)` buys `floor(proceeds ÷
  price)` units in the sale's month, even a refill month: added to the position's rate line when it has one, else a
  line `swap: true`; the cents left go to the residual. A target with no price sends the sale back to the pool. A month
  of swap lines alone is no instalment (`isRegularLine`, `locateOpenMonth` → `swap`): the aside reads «dicembre 2026 ·
  scambio, prima rata a febbraio 2028», the calendar «Scambio da fare»; sales that buy one instrument in one month are ONE purchase on their summed proceeds (`computeUsableLiquidity` merges them: the mirror had two lines and two orders); the verdict counts the rate as the months that buy (`countPlanInstalments`): before the start «N rate; a dicembre lo scambio: il ricavato delle vendite compra X», in the swap month «Scambio di dicembre: …» with «Prima rata a febbraio 2028, …», a month with nothing to buy beside late lines «Niente da comprare a gennaio, 1 in ritardo», a refill month «Rata k di n» on the NEXT rata (it read the month index over all the months before); the recalibration adds the swap's units to the
  suggested ones; `diffRevisionDisposals` reads a changed swap as a changed sale (removed + new). «Questo mese» draws a swap's purchase under the sales that pay it, «Con il ricavato: X» with its own Registra, from the moment the sales are registrable (before the plan starts too; owner, 2026-11-20: the sales read «Da fare» in November and the purchase appeared only in December, as a line of the rata); it is never among the rata's lines (`renderLine`, `swapRows`). The editor keeps
  the swap on a new quantity (untested, declared 2026-11-20: the editor goes when the guided path revises) and sets
  none.
- **The default source account** (owner, 2026-11-19): Impostazioni › Spese › «Conto per gli investimenti»
  (`AssetAllocationSettings.investmentCashAssetId`, doc/guide/impostazioni.md); `resolveInvestmentAccountId` — the path
  pre-ticks it alone while it is still a plan source account (`isPlanSourceAccount`), and nothing when it is gone.
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

## Creare un piano: il percorso

`/dashboard/allocation/piano` (2026-11-20; owner: «deve essere il più semplice possibile»): a PAGE, one 720px card per
screen (`PathCard`, DESIGN.md → The Path-Scene Rule), the same shape as Compravendita. The rules are pure in
`lib/utils/planPath.ts`, the words in `planPathNarrative.ts`.

- **Eight screens, one question each**: partenza (the model, today's weights, zero; «Dai pesi che hai appena calcolato»
  with a seed, «Dalla bozza che avevi» with a draft, chosen first) · versamento (the median's «Usa …») · durata (1–60,
  chips 6·12·24·36; the first instalment is the month after «Conferma») · conto (checkboxes, «Conto per gli
  investimenti» pre-ticked alone; none with several accounts and no setting; never saved as the setting) · riserva
  (`resolvePathReserveEur`: the computed figure follows the accounts until typed, «Torna a …» clears it) · vendite
  (quantity — empty = every share, never on a group's member — the month 1–months and the tax line) · strumenti (ONE
  list: «oggi x%», the quota, the sum, «Ridistribuisci il resto», «Aggiungi uno strumento» with «Nuovo strumento…» →
  `AssetDialog` `createEmpty`) · riepilogo (the editor's sentences on `buildDraftPreview`, the sales' taxes, the two
  warnings, the review note, the model box of the editor's rule). The sales come BEFORE the instruments: a sale of
  every share takes its row away (its quota to «Ridistribuisci»); a quantity typed after it brings the row back at 0 %.
- **The blocks**: each screen's sentence disables «Avanti» (`describePlanPathBlock`); the summary repeats them in
  order, then the engine's gate on the draft (`firstPlanPathRefusal` → `validateDraftAgainstAssets`).
- **The browser draft** `plan-path-draft:v1:{ownerId}` (`pathDraftStorage`): written on every change, nothing in it
  trusted — the proceeds are recomputed at today's price, a restored draft is reconciled with today's assets (a gone
  account or instrument dropped, the pending «Nuovo asset» label renamed, a held buyable instrument with no row added
  at 0 %). The open plan decides (`restorePlanPathDraft`): with a draft in Accumulo the browser draft counts only if it
  carries that draft's id, else the server draft at the first screen. «Ricomincia» (armed) → the initial draft; a seed
  is lost. The host mounts the wizard only on plans fetched AFTER mount (`refetchOnMount: 'always'`: a link from
  Accumulo finds the list fresh in the cache and would never refetch — found by the browser spec).
- **«Conferma»** creates the plan ACTIVE through `createAndActivatePlan` (and the model when the box is on). It first
  reads the Italian month again: another month writes nothing and says «Nel frattempo è cambiato il mese…»; then it reads
  the assets again (`getAllAssets`) and the gate runs on THAT list — an account deleted in another tab is
  `source_missing`, nothing written (found at the guided verification: on the page's list the plan was written). Disabled
  while it writes. An activation that fails leaves a draft: the path adopts its id, the next press overwrites it. A
  continued draft keeps its review month, notes and snapshot (`updateDraftPlan` replaces the draft whole), and a
  sale's swap (owner, 2026-11-20: `PlanPathSale.reinvestAssetId`, no screen asks it): a quantity or a month typed
  again keeps it, the sale taken back takes it away, it is not written once the plan no longer buys its instrument,
  and the summary's sale line ends «con il ricavato compri …». The plan just created keeps the done card: the
  wizard tells the host (`onCreated`), whose refetched list would otherwise find the plan active and swap the card for
  «Hai già un piano…» (found on the mirror tour, 2026-11-20; `pianoClient.test.tsx`, E1).
- **The states**: loading · demo · a failed read · no targets of the owner's own or from the goals (never the
  defaults) · an ACTIVE plan («Hai già un piano di accumulo attivo.», or the «tutte le rate chiuse» sentence, and «Apri
  Accumulo»; the browser draft cleared) · the wizard.
- **The entry points**: the empty tile's «Crea piano» (a link; a disabled button in demo or without targets), the
  model dialog's «Crea un PAC con questi pesi» (writes the seed as the browser draft, then navigates — no weight in the
  URL), the draft view's «Continua». No tab and no sidebar entry. The path offers NO groups by hand, no «Sostituisci»,
  no «Ottimizzato» (owner, 2026-11-19): groups come only from the model portfolio, as one row.

## Il piano del Consulente

The plan the Consulente's «Applica» creates (2026-11-20; doc/guide/consulente-piano.md § The book and «Applica»): it
arrives ACTIVE from one click, built from the report's operating plan on today's portfolio — no editor on this path,
no model called by the click. Until 2026-11-20 the «Applica» page linked here (`?da=consulente`) to a window that
seeded the editor from the optimizer; the window, its seed and the editor's kept-sale note are gone. An old bookmark
with `da=consulente` lands on the tab with the URL cleaned, nothing opened.

- **`createAndActivatePlan`** (`lib/services/accumulationPlanService.ts`): validates the draft on the given assets
  (`validateDraftAgainstAssets`, an issue = `PlanWriteError` `step: 'plan'` and nothing written), writes it —
  `createDraftPlan`, or `updateDraftPlan` on the open draft it replaces — then `activatePlan` (a failure =
  `step: 'activate'` with the `planId`: the draft stays, the next press replaces it), then the model when given (a
  failure is `modelError`, never a throw: the plan stands). Two transactions, as the editor's «Attiva».
- **`updateDraftPlan` replaces the draft whole** (2026-11-20): a draft without `optimizerSnapshot`,
  `reviewMonthIndex` or `advisorNotes` clears the three (`deleteField()`); the editor's `draftFromPlan` carries
  them, so a draft the click made and the editor saves again keeps its notes.
- **Its notes** (`AccumulationPlan.advisorNotes`, at most 40, each ≤ 400 characters): the app's corrections to the
  operating plan at the click, in order, without repeats. «Questo mese» (active view, under the reading) shows them
  under the sub-eyebrow «Dal Consulente», three in sight and the rest behind «Altre {n}» (`AdvisorNotes`). A
  revision from the Consulente replaces them; one from «Rivedi il piano» keeps them.
- **A position with no price** (2026-11-20): «Questo mese» (active view, above the notes) names every position to buy
  whose instrument has no price — «{nome} non ha un prezzo disponibile: non riceve acquisti finché non lo aggiorni.»
  (`describeUnpricedWarning`, the editor's sentence; `PositionState.unpriced`, quota above 0). The click creates one
  when no listing quotes the instrument; a plan by hand can hold one too.
- **The account**: `source_missing` (2026-11-20) — a source account id absent from the assets is an issue of
  `validateDraftAgainstAssets` with its sentence («Un conto del piano non c'è più…»), in the editor and at the click.

## Composizione mobile

Below `desktop:` the tab follows the shared small-screen composition (DESIGN.md → Small-Screen Composition):
verdict cut after the first sentence («Il perché · il rientro nella banda» closed), a strip of three cells
(Rata · Investito · la classe più lontana dalla banda, or «tutte in soglia»), THE tile **Questo mese** open, and
«Il resto della pagina» with closed rows in DOM order: **Classi del piano** and, when one exists, **Piani conclusi**.
Memory key `mobile-sections:allocation:accumulo` (the tab's own, not Bilanciamento's). At 768 two columns; in
landscape the stage and the icon rail. At 1440 nothing changes: two columns, no rows. **The two columns end on one line** (owner, 2026-11-18, as Bilanciamento's Piano and Per classe): the model's cell has no `desktop:self-start` and fills the `1fr` row to the right box's bottom edge; when the model's column is the taller, the box's last tile, Criteri del modello, grows (`desktop:flex-1`); without a plan the box takes the model's row alone (no `row-span-2`). Held by `e2e/accumulo.spec.ts` › «le due colonne finiscono sulla stessa riga», seen red at 82 and 145 px. With no row (no plan) there is no index and no stage: the grid of before, the empty tile across the page at every width (`PLAIN_GRID_CLASS`, `leadCellClass`; 2026-11-17, `e2e/accumulo.tablet.spec.ts`).

## Files

`types/accumulationPlan.ts` · `lib/utils/{accumulationPlanUtils,accumulationPlanMatching,accumulationPlanSchema,accumulationNarrative,accumuloSummary,zeroQuantityChip}.ts` · the slim read path `lib/utils/{openAccumulationPlan,planMonths,accumulationPlanDoc,accumuloMonth}.ts`, `lib/services/accumulationPlanRead.ts`, `lib/hooks/{useAccumulationPlans,usePacMonth}.ts` · `lib/services/accumulationPlanService.ts` (the transactions and the lock) · `lib/hooks/{useAccumulationPlan,useOpenAccumuloPlan,useMonthlySavingsMedian}.ts` · `components/allocation/{AccumuloTab,AccumuloTabSkeleton,AccumulationPlanDialog,AccumulationCalendarDialog,ClassDriftChart,PlanDraftSidePanel}.tsx` · the plan the Consulente's click creates: `lib/utils/advicePlan.ts`, `lib/services/advicePlanService.ts` (doc/guide/consulente-piano.md), the sentences both routes show in `lib/utils/accumuloCopy.ts` · `components/allocation/tiles/{QuestoMese,ClassiDelPiano,AccumuloVuoto,PianiConclusi}Tile.tsx` · the guided path: `app/dashboard/allocation/piano/page.tsx`, `components/allocation/piano/{PianoClient,PianoWizard,PianoScreens}.tsx`, `lib/utils/{planPath,planPathNarrative}.ts`, the shared `components/ui/{path-card,path-fields}.tsx` and `lib/utils/pathDraftStorage.ts` · tests `__tests__/accumul*.test.ts`, `__tests__/{questoMeseTile,accumulationPlanDialogSaleMonth}.test.tsx`, `e2e/accumulo.{mobile,tablet,piano,piano.mobile}.spec.ts` (fixture `e2e/accumuloFixture.ts`, `walkPlanPath` for the path).

- **Suites to run after a change here — Accumulo** (2026-11-17; the Consulente's click since 2026-11-20): `accumulationPlanUtils`, `accumulationPlanMatching`,
  `accumulationPlanSchema`, `accumulationPlanDoc`, `accumulationPlanService`, `accumulationPlanRevision`,
  `accumulationPlanReviewFlow`, `accumulationClassTrajectory`, `accumulationNarrative`, `accumulationReactivate`,
  `accumuloMonth`, `accumuloSummary`, `accumuloTileSentences`, `zeroQuantityChip`, `allocazioneNarrative`,
  `allocazioneSummary`, `mirrorCollections`, `persistCache`, `allocationAdviceHandoff`, `allocationAdviceDocument`, `advicePlan`, `advicePlanService`,
  `advicePlanNarrative`, `effectiveTargets`, `priceUpdater`, `yahooFinanceService`, `modelPortfolioGroups`, `narrativeTextNesting`, `planPath`, `pathDraftStorage` · **dom** `accumuloVuotoTile`, `pianoScreens`, `pianoWizard`, `pianoClient`, `pathCard`, `portafoglioModelloTile`, `planDraftSidePanel`,
  `assetDialogCreateEmpty`, `strumentiTile`, `consulenteBook`, `consulentePlanTick`, `useAdviceQuotes`,
  `questoMeseTile`, `accumulationPlanDialogSaleMonth` · **AI context** `assistantPortfolioContext`,
  `assistantPromptBundle`, `allocationAdviceApply`, `allocationAdvicePrompts`, `allocationAdvicePlanRead`, `allocationAdviceRun` · **Browser** `e2e/accumulo.spec.ts`,
  `e2e/accumulo.{mobile,tablet,piano,piano.mobile}.spec.ts`,
  `e2e/allocation.spec.ts` (the tab, the Piano's note), `e2e/bundle.lazy.mobile.spec.ts` (the lazy landing),
  `e2e/allocation.consulente.plan.spec.ts` (the plan the Consulente's click creates).

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
- **«Parti da»** (the revision only, since 2026-11-20) seeds from today's tradable weights, typed targets or, when one is saved, the model portfolio (doc/guide/ottimizzatore.md); on a «superato» model the option stays and the tile's stale sentence shows under it — as under the path's «Dal portafoglio modello».
- **A plan made from a model keeps the model's groups as rows** (2026-11-20): the path never edits a group; to change
  a group, change the model.
- **The path's computed reserve counts the ticked accounts only** (2026-11-20, README § 4 choice ac): it differs from
  the revision's by design; typed the same in both, the instalments are the same (measured on the seed account at
  the guided verification: twelve identical instalments).
- **The editor's create branches are dead until the revision moves to the path** (2026-11-20, declared): every caller
  passes `revise`; a draft is continued only in the path.
- **No tab bar without a Piano**: with no assets, a failed read or no Piano (the page's `loadFailed` and `!hasAssets`
  branches) the page draws no `PageTabs`, so `?tab=accumulo` lands on Bilanciamento's state there — declared on
  2026-11-12, not a bug. The loading branch draws the bar.
- **A class at 0% target is not drawn** (owner, 2026-11-17): `onlyTargetedClasses` takes it out of the editor's panel, the chart, the calendar and the re-entry sentence — Impostazioni saves every class, the empty ones at 0, and «Immobili 78,6% → 0%» squashed the chart. The filter is the VIEWS' only: `projectClassTrajectory` keeps every class, its cash class proves the money conserved (`__tests__/accumulationClassTrajectory.test.ts`).
- **«Mai comprato»** (`describeZeroQuantityChip`) needs `Asset.createdEmpty`, written only by «+ Nuovo asset»: an asset created at 0 before 2026-11-12, or a position sold before the ledger migration, reads «Azzerato».
- **The census fixture plants a plan and its lock** (`scripts/seedCensusE2E.mts`); the `allocazione-accumulo` entry of `perf/mobile-budget.json` is measured on this machine (doc/guide/prima-schermata-misure.md).
- **The Consulente's plan: what the click does not do** (declared on 2026-11-20): no editor between the report and the
  plan (it is revised from «Rivedi il piano»); no government bond's terms (the asset form owns them; the price is
  Borsa Italiana's at the click, else it arrives at the first daily update); no group of equivalent instruments (one
  instrument per row); the Assistente creates no plan; no Yahoo symbol searched by ISIN (measured on 2026-11-19:
  one listing, then a validation throw — the symbols come from the instruments stage); no undo as one action
  («Interrompi piano», then the instruments at 0 quotes deleted from Patrimonio).
