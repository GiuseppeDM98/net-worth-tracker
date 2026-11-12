# Allocazione › Portafoglio modello e ottimizzatore

*The question it answers: «quali pesi dovrei avere, dati i miei criteri, e quanto me ne separa?»* A saved **portfolio
model** (target weights per instrument) and the **weight optimizer** that proposes it, both on Allocazione › Accumulo.
The PAC never sells, so the model is where the app says what the portfolio should look like and the plan is how the
monthly inflow gets closer.

## Rules

- **The criteri («Criteri del modello»)** are `AssetAllocationSettings.idealAllocation` (`IdealAllocationSettings`):
  `enabled`, a priority per objective (`ObjectivePriority`), class objectives, leverage, factor objectives and groups.
  They are edited on Allocazione › Accumulo (`ObiettiviDialog`); Impostazioni › Allocazione shows a read-only
  summary (`IdealAllocationSummary`) with a link. The field rides through the settings draft untouched
  (`settingsDraft.ts` carry-through) and both write chains of `assetAllocationService` serialize it.
- **The engine is pure** (`lib/utils/weightOptimizer.ts`): `runOptimizer` builds the candidates and objective rows,
  `optimizeWeights` solves a convex quadratic program by an exact active-set method (`activeSetQP.ts`, box
  projection in `boxProjection.ts`). Two modes: **Raggiungibile col PAC** never goes below what is held (the PAC does
  not sell), **Ideale** ignores what is held. An objective that cannot be met is reported as a conflict
  (`computeConflicts`), never silently dropped.
- **«Con vendite mirate»** (a third mode, only in «Allocazione ideale»; the PAC does not sell): the same objectives
  under a tax cap in euro (`Tasse massime`) and a «Non vendere» box per instrument (dialog state, never persisted;
  a frozen instrument or one with no fiscal cost basis is locked). The tax of a sale is the gain share of the price
  times the asset's rate (`taxPerEuroSoldOf`); where the cap does not bind the mode is Ideale, where it does the
  engine searches the tax multiplier on the same solver (`solveTargeted`). The table shows the tax per row and one
  total line («Vendi …, paghi circa … di tasse»); «Crea un PAC» seeds the sales as planned disposals.
- **The model** lives in `modelPortfolios/{ownerId}` (`types/modelPortfolio.ts`): weights per instrument (a group of
  equivalent instruments buys with its first member), an origin (`manual` | `optimizer`) and the snapshot of the
  calculation it started from. The Firestore rule is in `firestore.rules` and **must be published by hand**.
- **Where it is used**: `PortafoglioModelloTile` compares today with the model; the PAC editor's step 2 has an
  «Ottimizzato» view (`OptimizerPanel`) and a «Parti da» seed from the model; «Allocazione ideale»
  (`IdealCompositionDialog`) runs the optimizer on single instruments, saves the model or creates a PAC with its
  weights. With a model and no open plan the tab's header reads the model as the target (`targetSource`).
- **Sentences** live in `weightOptimizerNarrative.ts`, `settingsNarrative.ts` and `modelPortfolio.ts`, never in a
  component. Figures in tests are invented and round.

## Files

`types/modelPortfolio.ts` · `lib/utils/{weightOptimizer,weightOptimizerNarrative,activeSetQP,boxProjection,modelPortfolio,idealAllocationEditor,runGuarded}.ts` · `lib/services/modelPortfolioService.ts` · `lib/hooks/useModelPortfolio.ts` · `components/allocation/{OptimizerPanel,OptimizerReport,IdealCompositionDialog,ObiettiviDialog,ModelEditDialog}.tsx` · `components/allocation/tiles/{ObiettiviTile,PortafoglioModelloTile}.tsx` · `components/settings/{IdealAllocationTile,IdealAllocationSummary}.tsx` · tests `__tests__/{weightOptimizerTargeted,weightOptimizer,weightOptimizerNarrative,activeSetQP,boxProjection,modelPortfolio,modelPortfolioGroups,idealAllocationEditor}.test.ts`.

## Per-page blind spots

- **Query key**: saving the model invalidates `queryKeys.modelPortfolio.byOwner`, the key the tile, the PAC editor and
  the header all read.
- **The optimizer weighs class, leverage, factor and group objectives only**; a class objective and a leverage
  objective can disagree, and the report then names the conflict instead of picking a side.
- **The model never sells**: an instrument above its model weight stays above it, and the tile points at «Con vendite mirate» in «Ricalcola».
- **The census fixture and the mobile budget have no model**: the tab with a model is measured by hand.
