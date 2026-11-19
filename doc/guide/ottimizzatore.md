# Allocazione › Portafoglio modello e ottimizzatore

*The question it answers: «quali pesi dovrei avere, dati i miei criteri, e quanto me ne separa?»* A saved **portfolio
model** (target weights per instrument) and the **weight optimizer** that proposes it, both on Allocazione › Accumulo
(2026-11-17, from Giorgio Trentadue's PR #487). A PAC's instalments only buy (its sales are the planned
`disposals`, seeded by «Con vendite mirate» or added by hand), so the model is where the app says what the portfolio
should look like and the plan is how the monthly inflow gets closer.

## Rules

- **The criteria («Criteri del modello»)** are `AssetAllocationSettings.idealAllocation` (`IdealAllocationSettings`):
  `enabled`, a priority per objective (`ObjectivePriority`), class objectives, leverage, factor objectives, instrument
  limits and groups. They are edited on Allocazione › Accumulo (`ObiettiviDialog`, «Prova» runs the optimizer on
  the click only); Impostazioni › Allocazione shows a read-only summary (`IdealAllocationSummary`) with a link. The
  field rides through the settings draft untouched (`settingsDraft.ts` carry-through, its default in
  `lib/constants/idealAllocation.ts`: Impostazioni imports neither the optimizer nor its narrative) and both write
  chains of `assetAllocationService` keep it — an «Applica» of the Consulente that writes only the targets leaves it.
- **The engine is pure** (`lib/utils/weightOptimizer.ts`, its types in `types/optimizer.ts`): `runOptimizer` builds
  the candidates and objective rows, `optimizeWeights` solves a convex quadratic program by an exact active-set
  method (`activeSetQP.ts`, box projection in `boxProjection.ts`). Three modes: **Raggiungibile col PAC** never goes
  below what is held (a PAC's instalments only buy), **Ideale** ignores what is held, **Con vendite mirate** sells under a
  tax cap (below; only in the model's dialog, never in the PAC editor). An objective that cannot be met is
  reported as a conflict (`computeConflicts`), never silently dropped; caps that cannot reach 100 are
  `infeasible_bounds`, said before the solver runs. The run happens on «Calcola» / «Prova», in the handler: the
  result is stored with the key of its inputs and shown only while they match — no memo, no effect.
- **The base is Bilanciamento's** (2026-11-12): `buildStandaloneCandidates` makes every asset of the base a
  candidate — the accounts are ONE candidate «Liquidità» (key `liquidita`) net of the personal loans, a property
  counts net of the loans that finance it (`resolveAllocationRoleWithin`), a loan is never a candidate. Σ of the
  candidates = `compareAllocations(...).marketValue`. Besides the base, `StandaloneCandidates` names the fixed rows
  (`fixedKeys`, whose difference prints «—») and the instrument count (`instrumentCount`, the reading's «n strumenti»). A property below its mortgage stops «Calcola» with the
  sentence; a liquidity below zero is declared and the run proceeds (its floor at 0 proposes to bring it back).
- **«Importo da investire» is money taken from the accounts** (owner, 2026-11-12): it never grows the base. In
  «Raggiungibile» every candidate keeps today's share as its floor except «Liquidità», whose floor goes down to
  (liquidity − amount) / base; in «Ideale» the amount is not read. An amount above the liquidity is refused under
  the field and «Calcola» is off.
- **Rounding**: half points within the bounds by largest remainder (`roundWeights`); hundredths when the half-point
  grid cannot hold the bounds (a frozen 7,3%). A fixed share is put on the nearest hundredth, a «Raggiungibile»
  floor DOWN to the hundredth — the proposal can sit under today's share by less than 0,01 points, never more.
  A fixed row's difference is that rounding only, so the dialog prints «—» there, never euro (owner, 2026-11-17).
- **«Con vendite mirate»** (`mode: 'targeted'`, 2026-11-18, from PR #488): the same `J(w)` under a cap in euro of
  tax («Tasse massime (€)») and a «Non vendere» box per row; the rows (name, current weight — the builder's value,
  never the 1 € stand-in of «Liquidità» — and the box) are on screen before «Calcola». Each sale is priced by the app's
  ONE rule, `saleTaxPerEuro` (`lib/utils/saleTax.ts`): not taxable → exempt, no EUR basis or no rate → unknown and
  never sold, the gain fraction floored at 0 (a loss pays nothing and offsets nothing: the losses note is the first
  line under the table), no sale fee (a proposed sale has none yet). A group is priced at its BUYER, the only member a
  plan sells (`candidateSaleTaxPerEuro`; a composite buyer's most-taxed sleeve). Where the cap does not bind it
  runs Ideale's pipeline, inside the locks and the cash quota (below); at cap 0 no TAXED candidate goes below its held
  weight, as in «Raggiungibile», while the liquidity and an exempt or at-a-loss row may still move; between them a tax-multiplier search (`searchTaxMultiplier`) on the
  same solver. The tax the Impostazioni limits force (a max below the held weight) is the cap when above it, and the
  total line says so; a search that does not finish falls back to the least-tax point, never over the cap
  (`not_converged`). Held weights stay off the half-point grid and the rounding only ever shrinks a sale, inside every
  bound. **A forced lock** (ticked, disabled, the reason under the name — «Aliquota non impostata», «Costo fiscale
  sconosciuto», «Bloccato in Impostazioni», «Immobile: resta com’è», «Non si vende sul mercato» for a pension fund)
  reaches the optimizer as a lock too: a pension fund costs no tax, yet is never sold (2026-11-18). A locked fixed share
  (a property, a frozen asset) is held at its value, with no `bound_conflict`. **Spending the liquidity is not a
  sale** (owner, 2026-11-12): `sale.liquiditySpentEur`, out of `soldEur` and `taxEur`, «—» in its «Tasse» cell, «, usi X €
  di liquidità» in the total line, which is the dialog's reading (four-digit euros ungrouped, «8000 €», as everywhere,
  owner 2026-11-18). **The cash quota** (owner, 2026-11-18, found at the tour): the accounts and the money-market
  funds together never go under the allocation's cash quota — the plan's own, `resolvePlanReserve(...).quotaEur`, as
  `sale.cashFloorEur` — nor under today's level when already below (`applyCashFloor`: every cash row keeps the same
  share of what it holds as a lower bound; a max in Impostazioni wins), so the PAC made from the run refills no reserve
  the run spent. The cap and a box clear the result; the snapshot keeps `taxCapEur` and `lockedKeys` (the ticks
  and the forced locks). At 390 the € difference column yields to «Tasse» (`TARGETED_DIFF_CLASS`), the rows are 44px,
  the mode pill is three cells. **«Crea un PAC con questi pesi»** seeds the sales (`seedDisposalsFromSale`): sold
  whole only what the run brings to 0% — then no position —, every other sale in whole shares, a money-market fund
  too (doc/guide/accumulo.md).
- **The model** lives in `modelPortfolios/{ownerUid}` (`types/modelPortfolio.ts`): weights per instrument (a group
  of equivalent instruments buys with its first member), an origin (`manual` | `optimizer`), the snapshot of the
  calculation it started from and its **fingerprint**. «Liquidità», a property, a money-market fund and a pension
  fund are candidates (they are in the base) and never a weight of the model — a model seeds a plan, which cannot
  buy them; the instruments' weights are renormalized to 100. The Firestore rule is in `firestore.rules` and **is
  published by hand** (`npx firebase deploy --only firestore:rules`): published by the owner before 2026-11-18, ahead
  of any deploy (additive, a new collection; no migration); the mirror and the census fixture own the collection (`scripts/mirrorCollections.ts`).
- **«Superato»** (owner, 2026-11-12): the fingerprint is FNV-1a 32-bit over a key-sorted JSON of the STORED targets,
  the criteria, with goal-driven allocation on each goal's `id`, `targetAmount`, `priority` and
  `recommendedAllocation`, and the `assetId:role` of every asset whose role is not `tradable` (`modelFingerprint`).
  Targets, criteria and roles stale the model; a price, a new tradable asset and an «Applica» that writes the same
  targets do not — it reads values, never a date. The targets are hashed as they weigh (`weighingTargets`): a class at
  0% with nothing else, a switched-off sub-category block and a switched-off fixed amount count as absent, since
  Impostazioni writes them on a save that changes nothing (owner, 2026-11-17). A model without a fingerprint is stale. The basis is built by `AccumuloTab` (`buildModelBasis`
  from the settings and the goals the page hands it), never by the page: its first chunk does not carry the model's module. A save that sets the
  weights («Salva come portafoglio modello», «Modifica a mano», «Usa i pesi del piano», the editor's «Aggiorna anche
  il portafoglio modello» — on «Attiva», on the revision and, since 2026-11-18 (owner, on the tour of the Consulente's hand-off), on «Salva
  bozza» too: a ticked box that wrote nothing read as a broken promise) records the fingerprint of that moment; «Aggiungi strumento da valutare» keeps the stored
  one, so a stale model stays stale. A plan's weights become the model's with every row above 0 AND every row at 0 the owner holds (`planPositionsToModelWeights`, owner 2026-11-18, on the same tour): out of the model a held instrument left the base of «Oggi», which read a weight four times its share of the portfolio. The tile, its closed row and the editor's «Parti da: modello» say «superato».
- **Where it is used**: `PortafoglioModelloTile` compares today with the model; the PAC editor's step 2 has an
  «Ottimizzato» view (`OptimizerPanel`) and a «Parti da» seed from the model; «Ricalcola» (`IdealCompositionDialog`,
  a tile-shaped modal: eyebrow, title, the status as the reading, the actions in the footer) runs the optimizer,
  saves the model or creates a PAC with its weights (`PlanSeedDraft`). The model is read only on the tab: the
  Allocazione header reads the targets of the settings or of the goals, never the model.
- **Sentences** live in `weightOptimizerNarrative.ts`, `settingsNarrative.ts` and `modelPortfolio.ts`, never in a
  component. Figures in tests are invented and round.

## Files

`types/{optimizer,modelPortfolio}.ts` · `lib/constants/idealAllocation.ts` · `lib/utils/{weightOptimizer,weightOptimizerNarrative,activeSetQP,boxProjection,modelPortfolio,idealAllocationEditor,runGuarded,saleTax}.ts` · `lib/services/modelPortfolioService.ts` · `lib/hooks/useModelPortfolio.ts` · `components/allocation/{OptimizerPanel,OptimizerReport,IdealCompositionDialog,ObiettiviDialog,ModelEditDialog}.tsx` · `components/allocation/tiles/{ObiettiviTile,PortafoglioModelloTile}.tsx` · `components/settings/{IdealAllocationTile,IdealAllocationSummary}.tsx` · tests `__tests__/{weightOptimizer,weightOptimizerTargeted,saleTax,weightOptimizerNarrative,activeSetQP,boxProjection,modelPortfolio,modelPortfolioGroups,modelPortfolioService,idealAllocationEditor}.test.ts`, `__tests__/{idealCompositionDialog,obiettiviDialog,portafoglioModelloTile}.test.tsx` · E2E `e2e/accumulo.spec.ts` (the criteria and, for «Con vendite mirate», `taxRate` on two seed ETFs planted and restored by `e2e/accumuloFixture.ts`).

- **Suites to run after a change here — Portafoglio modello** (2026-11-18): `weightOptimizer`, `weightOptimizerTargeted`, `saleTax`, `allocazioneSummary`, `accumulationPlanUtils`, `weightOptimizerNarrative`,
  `activeSetQP`, `boxProjection`, `modelPortfolio`, `modelPortfolioGroups`, `modelPortfolioService`, `idealAllocationEditor`,
  `settingsDraft` (the module hygiene), `settingsRoundTrip`, `settingsNarrative`, `allocazioneNarrative` (the page reads no
  model), `accumuloSummary`, `accumuloTileSentences`, `mirrorCollections` · **dom** `idealCompositionDialog`, `obiettiviDialog`,
  `obiettiviTile`, `portafoglioModelloTile`, `accumuloVuotoTile` · **Browser** `e2e/accumulo{,.mobile,.tablet}.spec.ts`.

## Per-page blind spots

- **Query key**: saving the model invalidates `queryKeys.modelPortfolio.byOwner`, the key the tile and the PAC
  editor read.
- **The optimizer weighs class, leverage, factor, instrument and group objectives only**; a class objective and a
  leverage objective can disagree, and the report then names the conflict instead of picking a side.
- **The model never sells**: an instrument above its model weight stays above it, and the tile says so — then points
  at «Ricalcola», whose «Con vendite mirate» sells under a tax cap (`MODEL_TARGETED_HINT`, always under the table).
- **«Crea un PAC» filters the liquidity and a property out of the sales even though the optimizer already sells
  neither** (the liquidity's row sells 0, a locked fixed share is held): a guard, so mutating the filter alone stays
  green.
- **A sale at a loss counts 0,00 € in «Tasse»**, never a credit; the estimate takes no past losses either.
- **In the model's dialog «Liquidità» always takes the rest**: caps that cannot reach 100 show up only in the PAC
  editor's «Ottimizzato» path, where the candidates are the plan's instruments.
- **The census fixture and the mobile budget have no model**: the tab with a model is measured by hand.
