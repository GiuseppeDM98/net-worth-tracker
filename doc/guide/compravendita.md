# Patrimonio › Compravendita

> **When to open this guide** — whoever touches `app/dashboard/assets/compravendita/*`,
> `components/assets/compravendita/*`, `lib/utils/realEstateOperation{Plan,Draft,Narrative}.ts`,
> `lib/utils/propertyTransfer.ts`, `lib/utils/propertyLink.ts`, `lib/services/realEstateOperationService.ts`,
> `types/realEstateOperation.ts`, `components/settings/RealEstateDefaultsTile.tsx`, or the «Legata all'immobile» field
> of the expense form and the feed's detail. Born on 2026-10-21 (owner: «Sarebbe interessante poter
> scrivere tutto in un trasferimento solo, sia in fase di acquisto casa che in fase di vendita… io implementerei
> tutto in questa sessione»). In `AGENTS.md` the stub; here the whole rule.

## Files

- **Page**: `app/dashboard/assets/compravendita/page.tsx`, `components/assets/compravendita/CompravenditaClient.tsx`
  (the five reads, the demo gate, the failed read), `CompravenditaWizard.tsx` (the card, «Indietro»/«Avanti», the
  summary, «Conferma», the done view), `CompravenditaScreens.tsx` (each screen's controls), `fields.tsx` (`ChoiceRows`,
  `NumberField`, `DateField`, `AccountField`, `CategoryField` — a category or one of its subcategories, by allowed
  type). Reached from Patrimonio's header, «Compra o vendi casa».
- **Pure**: `types/realEstateOperation.ts` (the answers, the cost kinds and their allowed types, the screens, the
  defaults list), `lib/utils/realEstateOperationPlan.ts` (the arithmetic, what the account holds, the category
  suggestion, `buildRealEstatePlan`), `realEstateOperationDraft.ts` (the reducer, `screensFor`, the prefill, the draft
  on this browser), `realEstateOperationNarrative.ts` (every sentence), `propertyTransfer.ts` (the property as a
  transfer's end, shared with the expense form), `propertyLink.ts` (the house a row belongs to: `houseOfRow`,
  `housesByLoan`).
- **«Legata all'immobile»** (`Expense.propertyAssetId`): the field in `components/expenses/ExpenseDialog.tsx`
  («Impostazioni avanzate»), «Collega la serie a un immobile…» in `components/cashflow/TransactionFeed.tsx` → 
  `components/expenses/LinkSeriesDialog.tsx` (`target: 'property'`) → `linkSeriesToProperty`
  (`lib/services/expenseService.ts`).
- **Executor**: `lib/services/realEstateOperationService.ts`.
- **Setting**: `AssetAllocationSettings.realEstateCostCategories` (Impostazioni › Spese › «Compravendita»,
  `RealEstateDefaultsTile`; the five places in doc/guide/impostazioni.md).
- **Suites to run after a change here**: `realEstateOperationPlan`, `realEstateOperationDraft`,
  `realEstateOperationNarrative`, `realEstateOperationService`, `propertyTransfer`, `propertyLink`, `dialogNarrative`,
  `settingsDraft`, `settingsRoundTrip`, `reactCompilerCoverage` · **Browser** `e2e/assets.compravendita.spec.ts`
  (the four acts on the base seed, every write read back from Firestore; two decoy series in calendar — a debt and a
  life policy of no house — are planted so the sale's pre-tick has something to leave unticked: the base seed has no
  future series of its own).

## The path

- **One EVENT per run, written the day it happens** (owner, 2026-10-21): the preliminare (the deposit, the agency),
  then — another run — the rogito (the rest). A date after today is refused on the first screen: the property and
  the loans are created when «Conferma» is pressed, so a rogito typed ahead would show the debt months early. The
  rows the run writes still follow the app's one settlement rule: a mortgage's first instalment next month waits for
  its date (`balancePending`).
- **One question per screen, «Indietro» always** — the Consulente's card (doc/guide/consulente.md), so the reader
  learns one shape. `screensFor` keeps the screens an answer set needs, in `REAL_ESTATE_OPERATION_SCREENS` order:
  the mortgage BEFORE the balance at a purchase (the balance is the price minus the mortgage), «Rivaluta» only when the
  price moves the property's value, «Estinzione» only with a loan financing the property, «Serie» only with series in
  calendar after the rogito, «Centro» only with the cost centres on. The draft holds the screen by NAME
  (`neighbour` steps from a screen the answers no longer need), and lives on this browser
  (`real-estate-operation-draft:{uid}`), cleared by a confirmed run or by **«Ricomincia»** (any screen, armed like a
  movement's delete — `useArmedDelete`: «Premi di nuovo per ricominciare» — owner, 2026-10-21 tour, when a draft
  could not be thrown away halfway).
- **Leaving the property screen for a new (kind, event, property) fills what depends on it** (`prefillForProperty`):
  the deposits already received (every transfer OUT of the property — a property is sold once), each loan financing it
  at its debt, the series proposed to stop, the centre — an open centre already named like the default
  («Vendita Casa X») is picked instead of creating a twin. The same property again keeps what was typed.

## What a run writes (`buildRealEstatePlan`)

- **Costs are SPENDING, never value** (owner, 2026-10-21): the property is worth its price; notary, taxes, agency and
  the mortgage's own costs are rows in their categories, on the operation's account, on the event's day, booked in the
  operation's centre. A refund is income and never in the centre. Transfers and instalments are never in the centre.
- **A purchase**: the property is created at ZERO (`allocationRole: 'excluded'` and `isPrimaryResidence` when it is
  home, the «Intestatari» typed) and the transfers raise it — the deposit at the preliminare, the balance at the
  rogito. **The mortgage's principal lands on the property's value at once** (`adjustProperty`, reason `mortgage`):
  the bank pays the seller, so the loan (`financedAssetId`, its TAN, no owner field — it follows the property's) and
  the value appear together and the net worth does not move. The instalment is the French one (`frenchInstalment`,
  P·r / (1 − (1 + r)^−n)) unless typed; the series is monthly, `years × 12` rows (≤ 360), linked to the loan — and
  NOT to the house: its house comes from the mortgage (below).
- **The policies**: scoppio e incendio paid at the rogito (a row, in the centre) or monthly with the instalment (a
  series of its own, as the owner records it), linked to the house either way; a life/CPI policy paid at once, monthly
  to a date, or **financed** — a personal loan (class `cash`, the household's quotas) whose instalments are the cost: no
  spending row for the premium, or the cashflow would count it twice (once paid, once repaid). The net worth falls by
  the premium when the loan opens — Storico reads it as debt that went up. **Each life policy names its insured from
  the household** (a select of Impostazioni's members, owner 2026-10-21 tour — no free name; without members no field,
  and the policy is named by its number) **and asks «Legata alla casa»** (off: a personal policy outlives the house; on:
  a CPI of the mortgage — its rows and its loan's instalments carry the house). A PERSONAL policy's rows are its
  insured's (`personalMemberId`, «Spesa di»), only with Cashflow › Divisione on, as the form writes it; a CPI linked to
  the house stays in comune.
- **A sale**: at the preliminare the deposit RECEIVED is a transfer out of the property (refused above its value). At
  the rogito the property's value is first brought to what the buyer still pays (`saleAdjustment` = price − deposits
  received − value today, up or down — the «Rivaluta» screen, a line of its own, owner's choice). **Each loan financing
  it is closed WITH THE PRICE, as at the notary** (`payOffWithSale`, owner 2026-10-21 tour): the buyer's bank pays the
  seller's, so the debt and the house's value fall by the same amount in one transaction and NO row is written; the
  account receives the rest (`saleNet` = price − deposits − payoffs), as a transfer, and the house ends at zero,
  «Azzerato». Why no row: a `debt` payoff row counts as spending everywhere (Tracciamento, savings rate, Analisi,
  Storico, FIRE) while the price arrives as a transfer — on the tour the sale's month read the whole mortgage as
  spending. A debt above what is left of the price is refused on «Mutuo» (the difference is an «Estinzione
  anticipata» from the Cashflow, which stays spending: a personal loan paid off with savings is money spent, owner).
  The series ticked on «Serie» lose their occurrences dated after the rogito — given back if applied, their fees with
  them (`reverseAppliedBalances` + `deleteExpenseRows`). **Proposed: the series of the house and nothing guessed**
  (`isProposedToStop`, owner 2026-10-21 tour): a series linked to the property, or repaying one of its loans. A word
  («Assicurazioni › Vita») or a type (`debt`) proposed a personal life policy and a car loan — the owner ticks the rest.
- **Categories**: one picker per row, starting on the default saved in Impostazioni › Spese, else a name match of an
  allowed type (`REAL_ESTATE_COST_TYPES`: instalments `debt`, the refund `income`, the rest spending) through
  `KIND_KEYWORDS`: the SPECIFIC words first, a subcategory before a category («Casa › Assicurazione casa» beats
  «Assicurazioni»), then the BROAD ones, a category before a subcategory and, among categories, the shortest name
  («Casa» before «Arredo e casa») — on the tour «casa» picked «Casa › Assicurazione casa» for the certificates, then
  «Arredo e casa». A row whose category no longer resolves is left out, never guessed.

## «Legata all'immobile» — the house a row belongs to

- **`Expense.propertyAssetId`** (owner, 2026-10-21 tour): the house a mortgage-related row belongs to — a home or CPI
  policy, set by the purchase path, by the form («Impostazioni avanzate», never on a transfer, which names its property
  as an endpoint; on a series every occurrence takes it) or by «Collega la serie a un immobile…» from a series row's
  detail, which links EVERY occurrence, past included: the link moves no balance. Absent = linked to nothing, so no
  migration.
- **A row repaying a loan that finances a house belongs to THAT house** (`houseOfRow`: the loan first, then the row's
  own link): the detail reads «Immobile: Casa X · dal mutuo» and offers no link button; the purchase path writes no
  second link on the instalments. The sale proposes those series through `repaysLoan` all the same.

## The executor

- **Every write through the service that owns it** (`executeRealEstatePlan`): `createAsset` for the property and the
  loans, `createExpenseSettledOnDate` + `applyDebtRepayments` + `applyBalanceEffects` for every row (a transfer takes
  the account's transfer category, `ensureTransferCategory`), `updateCashAssetBalancesAtomic` for the value moved by
  hand and for a loan closed with the price (the loan and the house in ONE transaction), `createCostCenter`. An asset
  a step creates is named by the next through a ref (`property`, `mortgage`, `lifeLoan:n`); a ref the summary prints
  carries its name (`AssetRef.name` — the tour read «riducono il debito di il prestito della polizza»).
- **NOT atomic across steps**: the steps run in plan order and the first failure stops the run; the page says which
  step failed and how many landed (`describePartialFailure`) and disables «Conferma» — a second press would write the
  landed steps again. Every reader the steps touch is invalidated either way (assets, overview, expenses, centres).

## The plain transfer out of a property (the expense form)

- **A transfer can START from a property** (owner, 2026-10-21 — a sale, a deposit received), the mirror of the
  deposit onto one (doc/guide/cashflow.md § A transfer can land on a PROPERTY): «Origine» lists «Conti» and «Immobili»
  (`isTransferableProperty`: `realestate` at price 1), a property never on both ends, the hint says it is patrimony
  changing form. **A property never gives more than it is worth**: the form refuses an amount above its value under the
  amount («Supera il valore di Casa X (130.000,00 €): aggiornane prima il valore in Patrimonio.»), counting what the
  edited row already took from it (`propertyValueAvailable`); the revaluation is the owner's own gesture. **«Commissione»
  is hidden** with a property as origin (owner, 2026-10-21): it would be debited to the house, and a sale's costs are
  rows of their own. Leaving the transfer type clears a property origin.

## Composizione mobile

No composition, by design: like the Consulente (DESIGN.md → The Conversation-Is-Content Rule) the content is a
path — one column at 720px, one card per screen, 44px buttons below `desktop:`; no strip, no closed rows, no
`mobile-sections:` memory. Not among `mobile:census`'s surfaces (the route is not in `navigation.ts`).

## Per-page blind spots

- **The value check reads today's value**: a transfer out of a property still in calendar is not counted against
  the next one, and a rogito's revaluation does not move `lastPriceUpdate` (like a transfer onto a property, the
  sub-line keeps «valore a mano dal …» of the last hand-typed value).
- **The deposits received are every transfer out of the property**, whatever their date: a property sold, bought back
  and sold again would count the first sale's deposits too (correct the field on «Rogito»).
- **A stopped series loses its occurrences after the rogito only**: the rows between the preliminare and the rogito
  stay; a mortgage series linked neither to the loan nor to the house is listed but not proposed.
- **A loan closed with the price leaves no row**: Cashflow shows the net balance, not the payoff; the loan's own
  history in the rows ends at its last instalment, and «Estinto» in Patrimonio is the record.
- **The insured is not a written name any more**: a draft saved before the select keeps no insured and asks again.
- **The run is not atomic** (above): a failure halfway leaves the landed steps; the page names them and does not
  offer a retry.
- **No E2E of the policies screen**: the spec walks it with none chosen; the policy rows, the insured and the
  «Legata alla casa» tick are Vitest's (`realEstateOperationPlan.test.ts`, `realEstateOperationService.test.ts`), and
  the owner walked them on the mirror (2026-10-21).
- **The demo has no Compravendita**: it writes assets and rows, and the demo's are everyone's.
