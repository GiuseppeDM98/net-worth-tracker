# Allocazione › Accumulo (PAC)

*The question it answers: «il mio piano di accumulo sta funzionando, e cosa compro questo mese?»* A second tab of
Allocazione (`?tab=accumulo`) next to Bilanciamento. A plan splits a monthly inflow over instruments by target
weight, month by month, proposes the purchases and never writes a transaction on its own.

## Rules

- **One active plan per account**, stored in `accumulationPlans/{id}` (`userId` = the owner). The Firestore rule is in
  `firestore.rules` and **must be published by hand** (`npx firebase deploy --only firestore:rules`); until then the
  tab cannot read the collection.
- **A plan is a list of positions** (a label, a target weight, the member instruments and the one that BUYS,
  `buyAssetId`). Weights sum to 100. «Parti da» seeds them from today's tradable portfolio or from typed targets.
- **The engine is pure** (`lib/utils/accumulationPlanUtils.ts`): `buildPlan` lays the months, `matchLedger`
  (`accumulationPlanMatching.ts`) pairs the registry's BUY transactions with the planned lines, a late month carries
  its shortfall into the next. Sentences live in `accumulationNarrative.ts` and `accumuloSummary.ts`, never in a
  component.
- **«Registra» opens `TransactionDialog` prefilled** from the planned line and links the transaction on save
  (`onCreated`); an instrument with no asset yet is created from «+ Nuovo asset» (`AssetDialog`, `createEmpty`).
- **«Rivedi il piano»** rewrites the months from the first intact one; closed installments keep their lines
  (`buildRevisedPlan`). **«Riattiva»** reopens a plan interrupted under 30 days ago while none is open.
- **With an active plan** the Bilanciamento verdict names the month's installment instead of «Versa», and the Piano
  opens with a line saying what the PAC buys this month (`describePacOverlap`, `findPacSubstitutions`).
- **The page's money is in euros of the month**: the installment is ONE figure («Rata di ottobre»); the average is
  named only in the editor (`describeInstallmentAverage`).

## Composizione mobile

Below `desktop:` the tab follows the shared small-screen composition (DESIGN.md → Small-Screen Composition):
verdict cut after the first sentence («Il perché · il rientro nella banda» closed), a strip of three cells
(Rata · Investito · la classe più lontana dalla banda, or «tutte in soglia»), THE tile **Questo mese** open, and
«Il resto della pagina» with closed rows in DOM order: **Classi del piano** and, when one exists, **Piani conclusi**.
Memory key `mobile-sections:allocation:accumulo` (the tab's own, not Bilanciamento's). At 768 two columns; in
landscape the stage and the icon rail. At 1440 nothing changes: two columns, no rows.

## Files

`types/accumulationPlan.ts` · `lib/utils/{accumulationPlanUtils,accumulationPlanMatching,accumulationPlanSchema,accumulationNarrative,accumuloSummary,zeroQuantityChip}.ts` · `lib/services/accumulationPlanService.ts` · `lib/hooks/{useAccumulationPlan,useOpenAccumuloPlan}.ts` · `components/allocation/{AccumuloTab,AccumulationPlanDialog,AccumulationCalendarDialog,ClassDriftChart,PlanDraftSidePanel}.tsx` · `components/allocation/tiles/{QuestoMese,ClassiDelPiano,AccumuloVuoto,PianiConclusi}Tile.tsx` · tests `__tests__/accumul*.test.ts`, `e2e/accumulo.{mobile,tablet}.spec.ts` (fixture `e2e/accumuloFixture.ts`).

## Per-page blind spots

- **Query key**: every write (create, revise, interrupt, reactivate, confirm) invalidates `queryKeys.accumulationPlans.all`,
  the one key the tab and the Bilanciamento clause both read.
- **«Parti da»** seeds from today's tradable weights, typed targets or, when one is saved, the portfolio model (doc/guide/ottimizzatore.md).
- **`zeroQuantityChip` («Mai comprato») is a util here, not yet shown in Patrimonio.**
- **The census fixture and the mobile budget entry for this tab need a measurement on a real build** (`npm run mobile:census`, `mobile:budget`).
