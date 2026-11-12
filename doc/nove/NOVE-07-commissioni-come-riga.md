# NOVE-07 — A trade's fee is a spending row, out of the average cost

> Series `doc/nove/` (README.md § 5): **implemented after NOVE-03** (every ledger write decides inside its
> transaction, `assertTradeUnchanged`) **and NOVE-06** (`tradeMoneyIn`, the Driver's split). Integrates contributor
> PR #489 (head 9d163bb1, base 54634a9) **with changes**. Written on 2026-11-12; every `file:line` is cited on
> `develop` @ b841cbd7, the PR's as `pr489:<path>:<line>`. Executes the owner's decisions 18–23 and 31 (README.md § 3).

## 1. The problem today (evidence on the code)

**Today** a BUY adds `quantity × priceEur + fees` to `costBasisEur` (`lib/utils/assetTransactionUtils.ts:235-239`), so
the PMC every EUR figure reads (`averageCostEur`, `lib/utils/costBasisEur.ts:36-40`) carries the fees; a SELL's
realized P&L is net of its fee (`:252-255`); a sale's tax estimate stands on a third, fee-free basis
(`taxableGainEur`, `:256`, `:269`, kept by `feeFreeCostBasisEur`, `:214-216`). The fee lowers the settlement account
(`computeCashDelta`, `:355-360`) and no cashflow row says why.

**PR #489** takes the fee out of the EUR PMC (`pr489:lib/utils/assetTransactionUtils.ts:238`) and writes it as a
spending row in the fee category of Impostazioni › Spese (`pr489:lib/utils/tradeFeeExpense.ts`: `planTradeFee`,
`buildTradeFeeExpenseDoc`; no account, linked both ways `AssetTransaction.feeExpenseId` ↔ `Expense.feeOfTradeId`), a
fourth write of `commitTradeMutation` (`pr489:lib/server/assetTransactionUseCase.ts:544`). What it leaves wrong:

1. **The fee plan is decided outside the transaction**: `prepareFeeWrite`
   (`pr489:lib/server/assetTransactionUseCase.ts:209`, called at `:329`, `:412`, `:446`) reads settings and category
   with plain `get()`s on the trade's outside copy: two concurrent saves → two rows; a row named but not written
   (`:544-567`, row gone and no category) → a dangling id.
2. **The realized gain keeps the sale's fee** (`pr489:lib/utils/assetTransactionUtils.ts:255`), against decision 19.
3. **No fiscal basis is left** for the estimates that read the PMC: `components/assets/TaxCalculatorModal.tsx:89-93`,
   `lib/utils/withdrawalTax.ts:103`, `lib/utils/allocationUtils.ts:735-736` (→ `estimatePlanSaleTax`,
   `lib/utils/allocazioneSummary.ts:808-818`), `lib/services/assetService.ts:776-796` (estimated taxes of the
   overview, of Storico and of `calculateNetTotal`): all would drop by fees × rate, against decision 31.
4. **Every re-save of an old trade backfills a row** in its past month
   (`pr489:__tests__/assetTransactionWriteTx.test.ts:447`), against decision 21.
5. **The row is not a fee row to the cashflow**: `isFeeRow` (`lib/utils/expenseFee.ts:51-53`) reads only
   `feeOfTransferId`, so `ExpenseDialog` offers its amount, date and account
   (`components/expenses/ExpenseDialog.tsx:1523`, `:862-880`; an account debits it twice), Registra reads it as a
   pattern (`lib/utils/assistantRegisterContext.ts:235`), and both deletes remove it by hand
   (`components/cashflow/TransactionFeed.tsx:260`, `components/expenses/ExpenseTable.tsx:140`), leaving the trade
   naming a row that is gone.
6. **The Driver and the Panoramica count it twice**: `tradeAwarePriceEffect` (`lib/utils/marketEffect.ts:43-52`) puts
   the fee into «mercato» while the row puts it into «risparmio»; the remainder gives it back as «altre». NOVE-06's
   `tradeMoneyIn` copies the same rule.
7. **Rendimenti reads the row as money leaving** the whole-net-worth base (`lib/services/performanceService.ts:724`,
   `:794`: income − spending), against decision 23; the subset base (`lib/utils/portfolioFlows.ts:111-119`) stays net.
8. **The per-asset total return goes gross while the XIRR stays net**: `computeAssetTotalReturn` (`:552-571`) over
   realized + unrealized (fee-free), `buildXirrFlows` (`:391-396`) with fees; the Dividendi card likewise
   (`app/api/dividends/stats/route.ts:271-274`).
9. **The Admin trade mapper drops `feeExpenseId`** (`lib/server/assetAdminRepository.ts:72-90`): the overview, the
   emails and the dividend stats could never tell a fee with a row.
10. **`deleteAllAssetTransactionsForAsset`** (`lib/server/assetTransactionUseCase.ts:572-590`) leaves the fee rows of
    the trades it deletes pointing at nothing.
11. **The form's hint is always on** and false without a category
    (`pr489:components/assets/TransactionDialog.tsx:700`); decision 22 wants the field disabled with the link
    (`ExpenseDialog.tsx:889-918`).
12. **The AI reads it twice**: the ledger line prints «commissioni X» (`lib/server/assistant/prompts.ts:347`) and the
    cashflow block now carries the same euros as spending.
13. **Stale «fees included» sentences**: `costBasisEur.ts:5-13`, `:30`; `TaxCalculatorModal.tsx:89-91`, `:165`;
    `lib/utils/patrimonioSummary.ts:209`; `lib/utils/yieldOnCost.ts:28-29`, `:53`;
    `lib/utils/assistantPortfolioContext.ts:78`; `lib/services/pdfDataService.ts:198`;
    `assetService.ts:766-767`; `allocationUtils.ts:684`;
    `types/assets.ts:205-209`; `types/assetTransactions.ts:54-55`; `assetTransactionUtils.ts:123`, `:127`, `:150`,
    `:157-163`; `lib/utils/saleTax.ts:20-24`; `lib/utils/periodSales.ts:33-39`; `allocazioneSummary.ts:776-778`
    («fees excluded» while it reads the fee-inclusive PMC); `AGENTS.md:350`, `doc/guide/patrimonio.md:13` and
    `:54`, `doc/guide/panoramica.md:225-226`, `README.md:26`, `components/assets/AssetRow.tsx:294`,
    `components/assets/StrumentiTile.tsx:460`, `costBasisEur.ts:33`. `feeFreeCostBasisEur` becomes `costBasisEur`
    itself. The «Bumped from N→N+1» notes of `dashboardOverviewConstants.ts` are history and stay, except the
    owner's month named in the 19→20 note (§ 5, owner data).
15. **Deleting the ASSET leaves its trades' fee rows locked for good**: `app/api/assets/[assetId]/route.ts:120-133`
    deletes the asset and its future dividends only; with the trades unreachable, a row Cashflow refuses to delete
    could never be deleted.
14. **The stored PMCs** are fee-inclusive and the one-shot backfill is spent (`averageCostEurBackfilledAt`,
    `assetTransactionUseCase.ts:696-736`, trigger `app/dashboard/assets/page.tsx:241-258`).

## 2. Goal and acceptance criteria

A trade's fee is one cost, said once: a spending row in Cashflow and Budget; never in the PMC nor in a capital gain
shown; still in every RETURN (net) and in every TAX estimate (a fiscal basis of its own).

1. BUY 10 at 50 € with fee 5: `costBasisEur` 500, `averageCostEur` 50, `fiscalCostBasisEur` 505,
   `fiscalAverageCostEur` 50,5, `investedEur` 505, `feesEur` 5. **Proof**: U1.
2. BUY 10 at 100 (fee 5), SELL 10 at 120 (fee 5): `realizedPnlEur` 200, `taxableGainEur` 190, `divestedEur` 1195; the
   total return 190 € = the sum of its XIRR flows. **Proof**: U2, U3.
3. A trade created or edited with a fee and a fee category commits WITH its row (−fee, the trade's date, no account,
   `feeOfTradeId`), the trade naming it; an edit moves amount and date; a cleared fee or a deleted trade deletes it; the
   account is debited once. **Proof**: W1, W3, W4.
4. No category → no row, the trade saves, the field is disabled and links Impostazioni › Spese. **Proof**: W2, E1.
5. A trade saved with a fee before this change never gets a row; a fee given to a trade that had none creates one.
   **Proof**: W5, W6.
6. The fee plan is decided in the transaction: a row deleted, or a category deleted, between prepare and commit is
   seen by the commit. **Proof**: X1, X2, W7. (Two concurrent edits of the same trade are NOVE-03's 409, its E1.)
7. Converting the asset to a pension fund, or deleting the asset, keeps its fee rows as plain spending, deletable in
   Cashflow. **Proof**: W8, D1.
8. Driver: a 5 € fee with a row → «risparmio» −5, «mercato» 0, `other` 0; without a row → «mercato» −5, `other` 0.
   **Proof**: M1, G1.
9. Rendimenti, whole base: a fee row is not a flow. **Proof**: R1.
10. Every tax estimate stands on `fiscalCostPerUnitEur`; every PMC, G/P, YOC and «Carico» on the fee-free
    `costBasisPerUnitEur`. **Proof**: C1, C2, C3a, C3b, E1.
11. In Cashflow the fee row cannot be deleted nor have its type, amount, date or account edited; Registra never reads
    it as a pattern. **Proof**: F2, A2, E1.
12. The first Patrimonio visit re-projects both PMCs of every ledger asset (`averageCostEurFeeFreeAt`), no row created.
    **Proof**: B1.
13. The AI ledger line says when a fee is already among the spending; system prompts byte-identical. **Proof**: A1.
14. `tsc`, lint, Vitest in the three zones, `npx playwright test e2e/assets e2e/cashflow e2e/history`, `perf:budget`,
    `mobile:census` + `mobile:budget`. **Proof**: the runs. The routes this spec grows and their measure today:
    `/dashboard/history` 780 of 780 KB gz, `/dashboard/cashflow` 788,1 of 789, `/dashboard/assets` 736,2 of 737,
    `/dashboard/allocation` 604,8 of 605, `/dashboard/performance` 657,1 of 658.
15. A trade's fee row counts in Budget like any expense. **Proof**: F3.

## 3. Decisions

- **Owner (2026-11-12)**: **18** a purchase fee is a spending row, ONE PMC, fee-free · **19** a sale's fee is a row too
  and out of the realized gain shown · **20** the row counts in Budget like any expense · **21** the past is
  re-projected (a flag on the meta), no row for a past fee · **22** without a fee category the field is disabled and
  links Impostazioni · **23** in Rendimenti the fee stays a cost of the portfolio, the row is no withdrawal · **31** the
  tax estimates use a SEPARATE fiscal cost including the fees (purchase and sale), the PMC shown stays without; a
  PROPOSED sale (the Piano's, NOVE-18's targeted mode) has no fee yet and deducts none — the sale's fee enters on
  the sale the owner records.
- **Overturned (2026-11-12)**: the call of 2026-09-07 «ONE number, the fiscal one, on the table … and the sale
  simulation» (`costBasisEur.ts:10-12`), by 18 and 31; the rule of 2026-09-20 «the estimate stands on the price
  difference, no commission on either side» (`saleTax.ts:20-24`, doc/guide/registro-operazioni.md:62-69, settled on
  broker statements), by 31: the «Tasse trattenute» prefill and the period estimate now deduct both fees and sit below
  what the broker withholds by fees × rate; the figure the owner types still wins, sale by sale. The owner confirmed
  31 a second time on 2026-11-12 with the 2026-09-20 rule in front of him («Con le commissioni ovunque»).
- **Owner 43 (2026-11-12)**: in Divisione a trade's fee row belongs to whoever owns what is traded: the sole holder
  of the ASSET; when the asset is in comune or split by quota, the sole holder of the settlement ACCOUNT; else the
  row is in comune. **Owner 44 (2026-11-12)**: a fee the server could not write as a row is said in the toast.
- **Adopted, reversible**:
  - *Gain vs return*: every capital GAIN (realized P&L, G/P, the month's «hai realizzato») is fee-free; every RETURN
    (per-asset total return, XIRR, the Dividendi card, Rendimenti) is net of every fee and keeps today's figure — but
    for a fee before an adjustment, which now counts (the adjustment used to wipe it), as it always did in the XIRR.
  - *Legacy fee*: a stored trade with `fees > 0` and no `feeExpenseId` keeps no row on any edit; its fee stays in
    «mercato» and in the returns.
  - *The fee row is the trade's*: in Cashflow its delete is disabled and the form hides type, amount, date and
    account; a row gone by any path is re-created at its id by the trade's next save, when a category exists.
  - *Conversion to a pension fund, and the asset's delete*: the fee rows are UNLINKED, not deleted — the settlements
    are not reversed, the money did leave; unlinked, they are plain spending the owner can delete.
  - *A named row that is gone keeps its link* while no category can re-create it: the trade keeps `feeExpenseId`,
    so the next save with a category writes the row at that id instead of reading the fee as a legacy one.
  - *Owner data*: the owner-statement fixtures and comments in the files this spec meets are replaced by invented
    round figures, also where the new contract leaves a test green (§ 5).
  - *The re-projection* is `backfillAverageCostEur` with a new done-signal `averageCostEurFeeFreeAt`, writing both PMCs.
  - *AI*: «commissioni 2,00 € (già fra le spese)» on a ledger line whose fee has a row.
  - *TaxCalculatorModal*: «PMC» stays fee-free, a «Costo fiscale» row appears when it differs.
  - *Overview payload* `DASHBOARD_OVERVIEW_SOURCE_VERSION` 25 → 26 (`dashboardOverviewConstants.ts:63`).

## 4. Solution

**How the PR enters**: on the session branch from `develop`, `git cherry-pick --no-commit 9d163bb1` (sixteen
files). Every conflict resolves to the text of this § 4. The PR's hunks in `lib/server/assetTransactionUseCase.ts`,
`lib/utils/assetTransactionUtils.ts`, `lib/utils/costBasisEur.ts`, `__tests__/assetTransactionWriteTx.test.ts`,
`__tests__/assetTransactionUtils.test.ts`, `__tests__/periodSales.test.ts`,
`__tests__/assetTransactionAverageCostEurBackfill.test.ts` and `__tests__/assetTransactionsRoutes.test.ts` are
replaced by what § 4 and § 6 write, never merged. A conflict in a file this § 4 does not name stops the session and
goes to the owner. Two edits on everything kept from the PR: every «2026-10-21» becomes «2026-11-12» (the type
comments, the `describe` title), and the ticker in the PR's tests and in `describeTradeFeeNote`'s JSDoc becomes the
decoy «ORNI» («Commissione su acquisto di ORNI»).

**From the PR. As is**: `describeTradeFeeNote`, `buildTradeFeeExpenseDoc`, the fields `feeExpenseId` / `feeOfTradeId`
with their comments, their mapping in the use case (`docToAssetTransaction`, `buildTradeSetDocData`,
`buildTradeUpdateDocData`) and in `lib/services/assetTransactionService.ts:59-66`, the `expenses.all` line of
`invalidateTradeCaches`, the note and document tests. **Changed**: the engine, `planTradeFee` (facts, legacy rule), the
plan decided INSIDE the transaction, the form, the PR's tests re-pointed, the guide paragraph. **Dropped**:
`resolveTradeFeeCategory`, `prepareFeeWrite`, `FeeWrite`, `normalizeFeePresent` (a copy of `normalizeExpenseFee`), the
always-on hint, the test «creates the row when an old trade with fees is saved again». **Added**: § 1 items 5–14.

### `lib/utils/assetTransactionUtils.ts` — two bases, one fee total

`LedgerPositionState` (`:120-130`) gains `fiscalCostBasisEur: number` («the open position's cost, purchase fees
INCLUDED: every tax estimate's basis»), `fiscalAverageCostEur: number | undefined` and `feesEur: number` («Σ every
buy's and sell's fees: what a return is net of»); `costBasisEur` / `averageCostEur` / `realizedPnlEur` read «no fee
(2026-11-12)». `feeFreeCostBasisEur` (`:214-216`) is deleted. BUY (`:235-239`):

```ts
        // The PMC stands on price × quantity alone (owner, 2026-11-12): the fee is a spending row of its own
        // (lib/utils/tradeFeeExpense.ts). The fiscal basis keeps it — every tax estimate reads that one.
        const fees = t.fees ?? 0;
        const addedCostEur = t.quantity * t.priceEur;
        state.costBasisEur += addedCostEur;
        state.fiscalCostBasisEur += addedCostEur + fees;
        state.investedEur += addedCostEur + fees;
        state.feesEur += fees;
```

SELL (`:243-280`), in place of `:251-270`:

```ts
        const averageCostEur = state.quantity > 0 ? state.costBasisEur / state.quantity : 0;
        const fiscalAverageCostEur = state.quantity > 0 ? state.fiscalCostBasisEur / state.quantity : 0;
        const fees = t.fees ?? 0;
        const grossEur = t.quantity * t.priceEur;
        const soldCostBasis = t.quantity * averageCostEur;
        const soldFiscalCost = t.quantity * fiscalAverageCostEur;
        const realized = grossEur - soldCostBasis; // fee-free: the fee is a row (owner, 2026-11-12)
        state.realizedPnlEur += realized;
        const year = getItalyYear(t.date);
        state.realizedByYear[year] = (state.realizedByYear[year] ?? 0) + realized;
        state.costBasisEur -= soldCostBasis;
        state.fiscalCostBasisEur -= soldFiscalCost;
        state.divestedEur += grossEur - fees;
        state.feesEur += fees;
        state.quantity -= t.quantity;
        effect.realizedPnlEur = realized;
        effect.soldCostBasisEur = soldCostBasis;
        effect.averageCostEurAtTrade = averageCostEur;
        effect.taxableGainEur = grossEur - fees - soldFiscalCost; // the fiscal gain: both fees deducted (owner, 2026-11-12)
```

and the clamp zeroes `fiscalCostBasisEur` too. ADJUSTMENT (`:287-288`): `state.costBasisEur = t.quantity * t.priceEur;
state.fiscalCostBasisEur = state.costBasisEur;`. `:301` adds `fiscalAverageCostEur` (`fiscalCostBasisEur / quantity`,
undefined at 0); `buildDerivedAssetFields` (`:322-334`) returns it. `computeAssetTotalReturn` (`:557-558`):

```ts
  // A RETURN is net of every fee, like the XIRR's flows; the gains above it are fee-free (owner, 2026-11-12).
  const totalReturnEur = state.realizedPnlEur + unrealizedPnlEur + dividendsNetEur - state.feesEur;
```

`AssetTotalReturn` gains `feesEur`. Comments `:16-20`, `:123`, `:127`, `:150`, `:157-163` rewritten to «fee-free PMC,
fee-inclusive fiscal basis, returns net». `buildXirrFlows`, `computeInvestedCapital`, `computeCashDelta` unchanged.
`app/api/dividends/stats/route.ts:274`: `… + totalReturn.unrealizedPnlEur - totalReturn.feesEur`.

### Types

`types/assets.ts:205-210` — `averageCostEur` «no fee (2026-11-12)» and `fiscalAverageCostEur?: number` («purchase fees
included; the tax estimates' basis, lib/utils/costBasisEur.ts»). `types/assetTransactions.ts:54-55` — `fees`: «never in
the PMC; in the fiscal basis; a spending row when the trade names one»; `feeExpenseId?: string` (the PR's comment);
`AssetTransactionsMeta` gains `averageCostEurFeeFreeAt?: Date`, `:100` «superseded 2026-11-12». `types/expenses.ts:143`
— `feeOfTradeId?: string` (the PR's comment).

### `lib/utils/costBasisEur.ts` — the PMC and the fiscal cost

The header (`:1-16`) names two numbers: the PMC (`averageCostEur`, fee-free: table, G/P, YOC, PDF, Carico, AI) and the
fiscal cost (`fiscalAverageCostEur`: every tax estimate). `:30`: «The EUR PMC, no fee». New:

```ts
type FiscalCostFields = CostBasisFields & Pick<Asset, 'fiscalAverageCostEur'>;

/**
 * The FISCAL cost per unit in EUR, purchase fees included — what every tax estimate stands on (owner, 2026-11-12).
 * Until the one-shot re-projection reaches an asset its stored `averageCostEur` still carries the fees and stands in;
 * a position the ledger never priced has no fee to add.
 */
export function fiscalCostPerUnitEur(asset: FiscalCostFields): number | undefined {
  if (asset.fiscalAverageCostEur !== undefined && asset.fiscalAverageCostEur > 0) return asset.fiscalAverageCostEur;
  return costBasisPerUnitEur(asset);
}
```

Switched to it: `TaxCalculatorModal.tsx:93` (a new `fiscalCost` feeds the gain, `averageCost` stays the PMC),
`withdrawalTax.ts:103`, `allocationUtils.ts:735` (a holding's `costBasisEur`, read only by `estimatePlanSaleTax`), and
`assetService.ts`'s `calculateEstimatedTaxes` (`:788`) through a private `fiscalUnrealizedGain(asset)` with the guards
of `calculateUnrealizedGains` (`:776-782`), which stays on the PMC. Every other caller reads the fee-free PMC unchanged.

### `lib/utils/tradeFeeExpense.ts` (from the PR, changed)

```ts
export type TradeFeePlan =
  | { kind: 'none' } | { kind: 'create'; amount: number } | { kind: 'update'; amount: number } | { kind: 'delete' };

export interface TradeFeeFacts {
  /** The fee the trade carries after the mutation (absent on a delete). */
  fees: number | null | undefined;
  /** The trade as stored before the mutation, read in the transaction; absent on a create. */
  stored?: Pick<AssetTransaction, 'fees' | 'feeExpenseId'>;
  /** The row `stored.feeExpenseId` names exists (read in the transaction). */
  storedRowExists: boolean;
  /** A fee category exists to land a NEW row in (read in the transaction). */
  canCreate: boolean;
}

export function planTradeFee(facts: TradeFeeFacts): TradeFeePlan {
  const amount = normalizeExpenseFee(facts.fees);
  if (facts.stored?.feeExpenseId && facts.storedRowExists) {
    return amount === null ? { kind: 'delete' } : { kind: 'update', amount };
  }
  if (amount === null) return { kind: 'none' };
  // A fee saved before fees became rows keeps none: re-saving an old trade never backfills a month (owner, 2026-11-12).
  const legacyFee = !!facts.stored && !facts.stored.feeExpenseId && normalizeExpenseFee(facts.stored.fees) !== null;
  if (legacyFee) return { kind: 'none' };
  return facts.canCreate ? { kind: 'create', amount } : { kind: 'none' };
}

/** A row written for a trade's fee: its trade owns amount, date and account. */
export function isTradeFeeRow(row: Pick<Expense, 'feeOfTradeId'>): boolean {
  return !!row.feeOfTradeId;
}

/** The part of a trade's fee the cashflow does NOT carry: all of it without a row, nothing with one. */
export function feeOutsideCashflow(trade: Pick<AssetTransaction, 'fees' | 'feeExpenseId'>): number {
  return trade.feeExpenseId ? 0 : (trade.fees ?? 0);
}
```

The header keeps the PR's text dated 2026-11-12 plus the legacy rule. `lib/utils/expenseFee.ts:51`:
`isFeeRow(row: Pick<Expense, 'feeOfTransferId' | 'feeOfTradeId'>)` = `!!row.feeOfTransferId || !!row.feeOfTradeId`.

### `lib/server/assetTransactionUseCase.ts` — the fee inside the trade's transaction

`PreparedMutation` loses `tradeDocData` (built in the closure) and gains `newFeeRefId: string`, set by
`prepareCreate`, `prepareEdit` and `prepareDelete` (on a delete it is never written: the plan there is `delete` or
`none`) to `adminDb.collection(EXPENSES_COLLECTION).doc().id` (a new module constant beside
`ASSETS_COLLECTION`, `:46`: `const EXPENSES_COLLECTION = 'expenses';`). In `commitTradeMutation`, READS after r3:

```ts
    const existing = existingSnap.docs.map((d) => docToAssetTransaction(d.id, d.data())); // moved up: a pure map
    const expenses = adminDb.collection(EXPENSES_COLLECTION);
    // r4-r5: where a NEW fee row would land — read only when the new version carries a fee.
    const wantsFee = normalizeExpenseFee(plan.newTransaction?.fees) !== null;
    const settingsRef = adminDb.collection('assetAllocationTargets').doc(plan.ownerId);
    const settingsSnap = wantsFee ? await tx.get(settingsRef) : undefined;
    const feeCategoryId = settingsSnap?.data()?.transferFeeCategoryId as string | undefined;
    const categoryRef = feeCategoryId ? adminDb.collection('expenseCategories').doc(feeCategoryId) : undefined;
    const categorySnap = categoryRef ? await tx.get(categoryRef) : undefined;
    // r6: the fee row the STORED trade names (an edit or a delete).
    const stored = plan.targetTransactionId ? existing.find((t) => t.id === plan.targetTransactionId) : undefined;
    const storedFeeRef = stored?.feeExpenseId ? expenses.doc(stored.feeExpenseId) : undefined;
    const storedFeeSnap = storedFeeRef ? await tx.get(storedFeeRef) : undefined;
```

COMPUTE, after NOVE-03's checks (which stay first):

```ts
    const feeCategory = feeCategoryFrom(plan.ownerId, settingsSnap, categorySnap);
    const feePlan = planTradeFee({
      fees: plan.newTransaction?.fees, stored,
      storedRowExists: !!storedFeeSnap?.exists, canCreate: feeCategory !== null,
    });
    const feeRef = storedFeeRef ?? expenses.doc(plan.newFeeRefId);
    const keepsRow = feePlan.kind === 'create' || feePlan.kind === 'update';
    // A named row that is gone keeps its id while no category can re-create it: the next save with one writes it there.
    const keepsLink = feePlan.kind === 'none' && !!stored?.feeExpenseId
      && normalizeExpenseFee(plan.newTransaction?.fees) !== null;
    const tradeToWrite = plan.newTransaction
      && { ...plan.newTransaction, feeExpenseId: keepsRow || keepsLink ? feeRef.id : undefined };
```

`feeCategoryFrom(ownerId, settingsSnap, categorySnap): ExpenseFeeCategory | null` (private): null unless the category
doc exists with `userId === ownerId`, else `resolveExpenseFeeCategory([{ ...data, id: categorySnap.id, subCategories:
data.subCategories ?? [] }], settingsSnap.data())`. WRITES: w1 writes `buildTradeSetDocData(tradeToWrite!)` /
`buildTradeUpdateDocData(tradeToWrite!)`; w2 adds `fiscalAverageCostEur: derived.fiscalAverageCostEur`; a new w4:

```ts
    // w4: the fee row, with its trade or not at all. It moves no account: the settlement already debited it.
    if (feePlan.kind === 'delete') tx.delete(feeRef);
    else if (feePlan.kind === 'update') {
      tx.update(feeRef, { amount: -feePlan.amount, date: tradeToWrite!.date, updatedAt: new Date() });
    } else if (feePlan.kind === 'create') {
      const assetData = assetSnap.data();
      const label = (assetData?.ticker as string | undefined) || (assetData?.name as string | undefined);
      tx.set(feeRef, buildTradeFeeExpenseDoc({
        userId: plan.ownerId, tradeId: plan.tradeRef.id, amount: feePlan.amount, date: tradeToWrite!.date,
        category: feeCategory!, notes: describeTradeFeeNote(tradeToWrite!.type, label), now: new Date(),
      }));
    }
```

**Whose row it is** (decision 43) — `lib/utils/tradeFeeExpense.ts`:

```ts
type Holder = Pick<Asset, 'ownerMemberId' | 'ownerShares'> | null | undefined;
/** The one member a whole asset belongs to: `ownerMemberId` with no typed quota (assetOwnership.ts). */
const soleHolder = (asset: Holder) =>
  asset?.ownerMemberId && !(asset.ownerShares?.length) ? asset.ownerMemberId : undefined;
/** Whose spending a trade's fee is: the traded asset's sole holder, else the settlement account's, else in comune. */
export function tradeFeeOwner(asset: Holder, settlementAccount: Holder): string | undefined {
  return soleHolder(asset) ?? soleHolder(settlementAccount);
}
```

`buildTradeFeeExpenseDoc` gains `personalMemberId?: string`, written only when defined. The `create` branch above
passes `personalMemberId: tradeFeeOwner(assetData, cashData)`, `cashData` being the settlement account's document
the transaction already reads for the trade's `linkedCashAssetId` (`undefined` when the trade names none). The
`update` branch never rewrites it: a member the owner set by hand in the row's form survives a later edit of
the trade.

**The outcome the client is told** (decision 44). `TradeMutationResult` (`assetTransactionUseCase.ts:66`) gains
`feeRow: 'written' | 'none' | 'refused'`: `'written'` after a `create` or an `update`; `'refused'` when
`planTradeFee` asked for a row and the transaction found no category document (the cases of W7 and X2);
`'none'` otherwise (no fee, a legacy fee, a delete). `commitTradeMutation` returns it and `buildResult` copies it.
`TransactionDialog`'s success toast appends, on `'refused'`, `TRADE_FEE_NOT_WRITTEN` = «Commissione non registrata
in Cashflow: manca la categoria in Impostazioni › Spese» (`lib/utils/dialogNarrative.ts`, beside
`describeTradeFeeField`).

**`deleteAllAssetTransactionsForAsset`** (NOVE-03's transaction): after its two reads, `tx.get` each fee row its trades
name; beside the deletes, `tx.update(ref, { feeOfTradeId: FieldValue.delete(), updatedAt: new Date() })` on each that
exists; docstring «its fee rows stay as plain spending: the money left». `AssetDialog.tsx:1602` then invalidates
`queryKeys.expenses.all(ownerId)`. **`backfillAverageCostEur`** (`:696-736`, NOVE-03's per-asset transaction): guard
on `averageCostEurFeeFreeAt`; writes `{ averageCostEur, fiscalAverageCostEur, updatedAt }`; stamps
`averageCostEurFeeFreeAt`; docstring «re-run once on 2026-11-12: the PMC lost the fees».
`app/dashboard/assets/page.tsx:245` reads the new flag, `assetTransactionService.ts:101-102` maps it.
`lib/server/assetAdminRepository.ts:84` gains `feeExpenseId: data.feeExpenseId,`.

**The asset's delete** (`app/api/assets/[assetId]/route.ts`, the batch at `:120-133`): before the batch, read the
asset's trades (`assetTransactions` where `assetId` equals the asset's and `userId` the owner's) and, for each that
names a `feeExpenseId` whose row exists, add `batch.update(rowRef, { feeOfTradeId: FieldValue.delete(), updatedAt:
new Date() })` to the same batch: the rows stay as plain, deletable spending. The route's client caller invalidates
`queryKeys.expenses.all(ownerId)` beside what it invalidates today.

**`lib/services/dashboardOverviewConstants.ts`**: `DASHBOARD_OVERVIEW_SOURCE_VERSION = 26` with the note «Bumped
from 25→26: every G/P stands on the fee-free PMC, every estimated tax on the fiscal cost
(`fiscalCostPerUnitEur`), and `monthSales.realizedGain` is fee-free while `estimatedTax` deducts both fees
(2026-11-12) — a stored summary would mix the two bases».

### `lib/utils/marketEffect.ts` — one fee rule for the Driver and the Panoramica

```ts
/**
 * Net money the recorded trades put into an instrument (buys in, sells out). A fee counts only while no spending
 * row carries it (`feeOutsideCashflow`): with a row «risparmio» names it, and counting it here too would push the
 * same euros into «mercato» and back out of «altre» (2026-11-12).
 */
export function tradeMoneyIn(trades: AssetTransaction[]): number {
  let moneyIn = 0;
  for (const t of trades) {
    if (t.type === 'buy' && !t.isBaseline) moneyIn += t.quantity * t.priceEur + feeOutsideCashflow(t);
    else if (t.type === 'sell') moneyIn -= t.quantity * t.priceEur - feeOutsideCashflow(t);
  }
  return moneyIn;
}
```

`tradeAwarePriceEffect` (`:43-52`) keeps its loop for `tradedQuantity` only and takes `tradeMoneyIn(moneyTrades)`; its
docstring's «fees» become «fees no row carries». NOVE-06's private `tradeMoneyIn` in `growthDrivers.ts` is deleted and
imported from here. `portfolioFlows.indexLedger` and `computeInvestedCapital` keep every fee (decision 23).
`lib/services/performanceService.ts:724`, `:794`: `if (expense.type === 'transfer' || isTradeFeeRow(expense)) return;`
— «a trade's fee row is a cost of the portfolio, not money leaving it: the return stays net (owner, 2026-11-12)».

### Cashflow surfaces

`lib/utils/dialogNarrative.ts` gains:

```ts
export const TRADE_FEE_ROW_NOTE =
  'Commissione di un’operazione del registro: importo e data li tiene l’operazione, in Patrimonio, '
  + 'che l’ha già addebitata.';
export const TRADE_FEE_ROW_DELETE_BLOCKED = 'Si elimina con la sua operazione, in Patrimonio';
```

- `ExpenseDialog.tsx`: `isTradeFeeRowEdit = !!expense && isTradeFeeRow(expense)` beside `:1523`, passed to the body;
  when true the type block (`:582-626`) and the account block (`:862-880`) are not rendered and the amount + date grid
  (`:628-680`) becomes `<p className="text-sm text-muted-foreground">{TRADE_FEE_ROW_NOTE}</p>` (the hidden fields keep
  their loaded values). The fee field is already hidden by `isFeeRow`.
- `ExpenseTable.tsx:255-270` and `TransactionFeed.tsx:264-285`: on `isTradeFeeRow(expense)` the delete is `disabled`,
  `title={TRADE_FEE_ROW_DELETE_BLOCKED}`, aria-label `` `Elimina ${rowName} — ${TRADE_FEE_ROW_DELETE_BLOCKED}` ``; the
  feed detail's idle reading (`describeMovementDetailReading`, `dialogNarrative.ts:552-564`, new fact `tradeFee?:
  boolean`) appends `TRADE_FEE_ROW_NOTE`.

### `components/assets/TransactionDialog.tsx` — the field (`:686-700`)

Reads `useSettings(ownerId, { enabled: open })` and `useExpenseCategories(ownerId, { enabled: open })`; `feeCategory`
is `undefined` while either loads, else `resolveExpenseFeeCategory(categories, settings)`; `storedFee =
normalizeExpenseFee(transaction?.fees)`; the input is `disabled={storedFee === null && !feeCategory}` with
`aria-describedby="trade-fees-hint"`; under it `describeTradeFeeField(…)` or, on null, `TRADE_FEE_NEEDS_CATEGORY` +
`<Link href="/dashboard/settings?tab=spese">Impostazioni › Spese</Link>.` (the markup of `ExpenseDialog.tsx:909-918`).
The facts, in the dialog: `reading = settingsQuery.isLoading || categoriesQuery.isLoading`, `categoryLabel =
feeCategory ? expenseFeeCategoryLabel(feeCategory) : null`, `hasRow = !!transaction?.feeExpenseId`, `legacyFee =
!!transaction && !transaction.feeExpenseId && storedFee !== null`; the hint is `<p id="trade-fees-hint"
className="text-xs text-muted-foreground">`. In `lib/utils/dialogNarrative.ts`, beside
`EXPENSE_FEE_NEEDS_CATEGORY`:

```ts
export interface TradeFeeFieldFacts {
  reading: boolean; categoryLabel: string | null; hasRow: boolean; legacyFee: boolean;
}

/** The line under «Commissioni (€)»; null when no fee category is chosen (the link to Impostazioni shows). */
export function describeTradeFeeField(facts: TradeFeeFieldFacts): string | null {
  if (facts.hasRow) return 'Non entra nel prezzo medio: è la sua spesa in Cashflow, e cambia con l’operazione.';
  if (facts.legacyFee) {
    return 'Registrata prima che le commissioni diventassero spese: resta su questa operazione, fuori dal Cashflow.';
  }
  if (facts.reading) return 'Sto leggendo dove va la commissione…';
  if (!facts.categoryLabel) return null;
  return `Non entra nel prezzo medio: diventa una spesa in ${facts.categoryLabel}, alla data dell’operazione.`;
}

export const TRADE_FEE_NEEDS_CATEGORY = 'Per registrare una commissione scegli prima la categoria delle commissioni in';
```

`:153`'s comment: «the fiscal gain: both fees deducted». `TaxCalculatorModal`: the reading (`:165`) moves to
`dialogNarrative.ts` as `TAX_SIMULATION_READING` = «Una simulazione: niente viene registrato. La plusvalenza è
calcolata in euro sul costo fiscale del registro operazioni — il PMC più le commissioni d’acquisto — con l’aliquota
dello strumento.»; `:283`, the results row «Prezzo medio di carico (PMC)», becomes `{ label: 'Costo fiscale per
quota', value: formatCurrency(results.fiscalCost, 'EUR', 4) }` (`calculateResults` returns `fiscalCost` beside
`averageCost`, and the gain is `saleValue − quantity × fiscalCost`); the head list (`:183`) adds `{ label: 'Costo
fiscale', value: formatCurrency(fiscalCost, 'EUR', 4) }` right after «PMC» when `Math.abs(fiscalCost − averageCost)
>= 0.0001`.

### Comments and sentences that become false (§ 1 item 13)

- `lib/utils/saleTax.ts:20-24`: «Takes the TAXABLE gain — the replay's `taxableGainEur`: the sale's gross minus its
  fee minus the fiscal cost of the units sold (purchase fees included, owner, 2026-11-12) — never the realized P&L,
  which is fee-free. It sits below what a broker that ignores commissions withholds by fees × rate; the typed figure
  wins.»
- `lib/utils/allocazioneSummary.ts:776-780`: «… the gain of the slice being sold over the fiscal cost
  (`AllocatableHolding.costBasisEur`, purchase fees included)».
- `components/assets/AssetRow.tsx:294`, `StrumentiTile.tsx:460`: «the EUR PMC (no fee, the G/P's basis)»;
  `costBasisEur.ts:33`: «(the native PMC: the same fee-free basis, in the asset's currency)».
- `lib/hooks/useAssetTransactions.ts:6`: «a FOURTH key, `expenses.all`: a trade's fee is a row the server writes
  with it».
- Every other site of § 1 item 13: «fee-free PMC» where it reads the PMC, «fiscal cost, purchase fees included» where
  it estimates a tax.

### AI

`AssistantLedgerRow` (`assistantPortfolioContext.ts:147-157`) gains `feeIsSpendingRow: boolean` (`:497`,
`!!transaction.feeExpenseId`); `prompts.ts:347` appends `' (già fra le spese)'` after `commissioni ${eurCents(…)}` when
it holds. The data block only: no system prompt changes. `:78`: «The PMC per unit in EUR, no fee».

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **`runTransaction`: ALL `tx.get()` before ANY write** (AGENTS.md § Firestore Writes): r4–r6 precede w1; the pure
  `existing` map moves into READS.
- **A transaction retries its closure**: the new row's id comes from `prepare*`, never from inside the closure.
- **NOVE-03's `assertTradeUnchanged` is the FIRST statement of COMPUTE**: the fee plan stands on `stored`, just
  checked. Never plan the fee from `prepareEdit`'s copy: X1 and X2 change the store between prepare and commit.
- **Money in cents**: the row's amount is `normalizeExpenseFee`'s (to the cent), the settlement `roundToCents` as today.
- **The optional-field trap**: `buildTradeUpdateDocData` writes `feeExpenseId ?? FieldValue.delete()`; the unlink is a
  `FieldValue.delete()`.
- **A server-owned summary is fresh only while every write invalidates it** (AGENTS.md § Caching): the commit already
  invalidates; the payload version goes to 26 because G/P, taxes and `monthSales` change meaning.
- **Sentences live in `*Narrative.ts`**: the hints, the row sentences, the simulation's reading in `dialogNarrative.ts`.
- **DESIGN → The Status-Is-The-Reading Rule / The Modal-Is-A-Tile Rule**: the trade form's hint is a field line
  (`text-xs text-muted-foreground`), not the modal's reading; a disabled field keeps its label.
- **DESIGN → The Same-Basis Rule**: a G/P stands on the PMC, a tax on the fiscal cost; never one against the other.
- **AI system prompts byte-identical** (`expect(a.system).toBe(b.system)`): only the data block changes.
- **Fixtures invented and round** (decoys «ornitorinco», «fenicottero»). The owner-statement fixtures and comments
  are REPLACED by invented figures, never recomputed, and the words «owner's statement», the broker's name and the
  real instrument's name leave with them: in `__tests__/assetTransactionUtils.test.ts` the order at `:341-352` (→ U2)
  and the `computeCashDelta` case at `:384-387` (→ a sale of 10 at 150 less 5 of fees and 100 of withheld tax); in
  `__tests__/periodSales.test.ts` the header paragraph `:5-8`, the main ledger fixture and its two tests (`:63-112`,
  → P2) and the two «real account» comments (`:233`, `:275`, their figures → 150 / 4.000 / 4.000 and 120 / 0,04% /
  4.000); in `__tests__/saleTax.test.ts` the case at `:11-25` (→ a gain of 1.000 € at 26% = 260 €); the fixture name
  in `__tests__/dashboardOverviewService.test.ts:468` (→ «Ornitorinco»); the comments
  `lib/utils/saleTax.ts:22-24` and `lib/utils/assetTransactionUtils.ts:157-163` (rewritten by this spec anyway) and
  the month and figure in `lib/services/dashboardOverviewConstants.ts:50` («a stored month would keep the old
  estimate»); `doc/guide/registro-operazioni.md:62-69` (§ 9). No such figure is copied into a new test, a comment
  or a document.
- **No series label in the code; no dependency change.**

## 6. Tests per level (with the mutation that proves each)

Harness: `__tests__/assetTransactionWriteTx.test.ts` (the PR's fee `describe`, re-pointed); X1 on NOVE-03's gate in
`__tests__/assetTransactionsRoutes.test.ts`.

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `assetTransactionUtils.test.ts` case 1: the six figures of criterion 1 | add `fees` back to `costBasisEur` |
| U2 | BUY 10@100 f5, SELL 10@120 f5 → realized 200, taxable 190, divested 1195, `feesEur` 10 (replaces `:341-352`) | subtract the sell fee from `realized` |
| U3 | U2's ledger: `computeAssetTotalReturn(state, 0, 0).totalReturnEur` 190 = Σ `buildXirrFlows` amounts | drop `− state.feesEur` |
| U4 | `:354-367`: buys 10@100 f5, 10@120 f5, sell 5@130 f2 → taxable 95,5, realized 100; adjustment 15@90, sell 15@100 → taxable 150 | leave `fiscalCostBasisEur` unreset by the adjustment |
| P1 | `periodSales.test.ts:114-123` (already invented, re-pointed): buy 100@100 f10, sell 10@150 f20 → `realizedGain` 500, `estimatedTax` 124,54 (26% × 479) | estimate on `realizedGain` |
| P2 | `periodSales.test.ts`, the main fixture replaced by an invented «Ornitorinco» ETF at 26%: baseline 100@100, September sells 10@150 f5 and 10@160 f5 → proceeds 3090, `realizedGain` 1100, `estimatedTax` 283,40 (26% × 1090); with `withheldTaxEur` 100 and 150 → `estimatedTax` 250, `taxIsWithheld` true, `realizedGain` 1100 | read the estimate when a sale carries `withheldTaxEur` |
| F1 | `tradeFeeExpense.test.ts` `planTradeFee`: create; none without category; update with row, no category; delete on a cleared fee; none on a legacy fee; create when the named row is gone | remove the `legacyFee` line |
| F2 | `isTradeFeeRow`, `feeOutsideCashflow`; `expenseFee.test.ts`: `isFeeRow({ feeOfTradeId })` true | `isFeeRow` on `feeOfTransferId` only |
| F2b | `tradeFeeExpense.test.ts` › `tradeFeeOwner`: asset wholly of «m1» → `'m1'` whatever the account; asset in comune and account wholly of «m2» → `'m2'`; asset with `ownerShares` and no sole account → `undefined`; no account → the asset's answer | read the account first |
| F3 | `budgetUtils.test.ts`: `countsTowardBudget({ type: 'variable', feeOfTradeId: 't1' })` true | make `countsTowardBudget` skip fee rows |
| M1 | `__tests__/marketEffect.test.ts` (new file): BUY 2@100 f5, 0 → 200 € → effect 0 with `feeExpenseId`, −5 without | count `trade.fees` always |
| G1 | `growthDrivers.test.ts`: account 1000 → 795, ETF 0 → 200 by that BUY with its −5 row → savings −5, market 0, `other` 0, `otherHoldings` 0; no row → market −5, `other` 0 | keep NOVE-06's private `tradeMoneyIn` |
| R1 | `performanceService.test.ts` › `getCashFlowsFromExpenses`: +1000 income and a −5 trade-fee row → `netCashFlow` 1000 | drop the `isTradeFeeRow` skip |
| C1 | `costBasisEur.test.ts`: `fiscalCostPerUnitEur` prefers `fiscalAverageCostEur`, falls back to the PMC | return `costBasisPerUnitEur` always |
| C2 | `assetService.test.ts`: 10 units at 120, PMC 100, fiscal 101, rate 26 → gains 200, taxes 49,4 | taxes on `calculateUnrealizedGains` |
| C3a | `withdrawalTax.test.ts`: the basis per unit is `fiscalAverageCostEur` | `costBasisPerUnitEur` at `withdrawalTax.ts:103` |
| C3b | `allocationUtils.test.ts` `buildHoldings`: `costBasisEur` = `fiscalAverageCostEur` × quantity | `costBasisPerUnitEur` at `allocationUtils.ts:735` |
| W1 | create BUY 10@100 f5 on `cash-1` with category → one row (−5, no `linkedCashAssetId`, `feeOfTradeId`) named by the trade; PMC 100, fiscal 100,5; cash −1005 | write the row after the transaction |
| W1b | W1 on an asset whose `ownerMemberId` is «m1» (no `ownerShares`) → the row carries `personalMemberId: 'm1'`, the result `feeRow: 'written'`; on an asset in comune settled on an account of «m2» → `'m2'`; a later PUT of the fee leaves a hand-set `personalMemberId` as it is | omit `personalMemberId` from the doc |
| W2 | no category → no row, no `feeExpenseId`, cash −1005, `feeRow: 'none'` | create with `category` null |
| W3 | fee 5 → 8 and a new date → row −8 on it; fee cleared → row gone, `feeExpenseId` removed | skip `tx.update` on `update` |
| W4 | delete the trade → its row gone | ignore `stored.feeExpenseId` on delete |
| W5 | stored `fees: 5`, no row, note edited → no row; PMC 100 | drop the legacy guard |
| W6 | stored trade without fee, edited to fee 3 → one row −3 | treat any stored trade as legacy |
| W7 | settings name a category whose doc is gone → no row, trade saved | skip the `categorySnap.exists` check |
| W8 | `deleteAllAssetTransactionsForAsset` on two trades, one with a row → trades gone, row kept without `feeOfTradeId` | `tx.delete` the row |
| W9 | stored trade fee 5 naming `fee-1` (no such row), no category, note edited → the trade still names `fee-1`, no row; category planted, note edited again → `expenses/fee-1` −5 | drop `keepsLink` |
| D1 | `__tests__/assetDeleteRoute.test.ts` (new): DELETE of an asset with two trades, one naming a fee row → asset gone, the row kept without `feeOfTradeId` | skip the unlink |
| X1 | `assetTransactionsRoutes.test.ts`, NOVE-03's gate: a BUY with fee 5 and its row `expenses/fee-1`; a PUT fee 8 is prepared, then (gate) `fee-1` is deleted from the store, then the PUT commits → success, `expenses/fee-1` exists whole (amount −8, `feeOfTradeId`, `categoryId`), the trade names `fee-1` | read the row's existence in `prepareEdit` |
| X2 | a POST BUY fee 4 is prepared with the fee category set, then (gate) the category doc is deleted, then it commits → success, no `expenses/` doc, the trade has no `feeExpenseId`, the answer carries `feeRow: 'refused'` | read the category in `prepareCreate` |
| B1 | `assetTransactionAverageCostEurBackfill.test.ts` (its fake gains NOVE-03's `runTransaction`): backfill with `averageCostEurBackfilledAt` only → runs, both PMCs written, flag stamped; again → `alreadyBackfilled` | guard on the old flag |
| A1 | `assistantPortfolioContext.test.ts` `feeIsSpendingRow`; `assistantPromptBundle.test.ts` «commissioni 2,00 € (già fra le spese)» and the `system` equality | print the suffix always |
| A2 | `assistantRegisterContext.test.ts`: a trade-fee row is in no pattern | revert `isFeeRow` |
| N1 | `dialogNarrative.test.ts`: the five outcomes of `describeTradeFeeField` (hasRow, legacyFee, reading, no category → null, the category sentence); the feed reading with `tradeFee` | swap the `hasRow`/`legacyFee` order |
| E1 | `e2e/assets.trade-fee.spec.ts` (new, 1440): no category → `#trade-fees` disabled, link to `?tab=spese`; category planted → a BUY with fee 5 writes the row; on Tracciamento its delete is disabled with the title and «Modifica» shows the note, no `#amount`; fee 8 → row −8; on the ETF bought with fee 5, «Quanto costa vendere» lists «PMC» 100,0000 € and «Costo fiscale» 100,5000 €, and a sale of 10 at 120 reads a gain of 195,00 €; trade deleted → row gone | render the delete enabled |

`e2e/assets.sale-tax.spec.ts`: plants the fee category and removes it and the fee row in `remove()` (the pattern of
`e2e/cashflow.transfer-fee.spec.ts:94-101`); `:98` expects `'63.7'` ((750 − 5 − 500) × 26%); the account assertion
(1675) is unchanged; it asserts one fee row of −5.

**Existing assertions the new contract turns red, re-pointed in this session (not a stop of § 11)**:
`assetTransactionUtils.test.ts` — case 1 (→ U1), case 3 at `:115-125` and `:597-606` (realized 198 → 200), the
`toEqual` on `buildDerivedAssetFields` near `:281` (gains `fiscalAverageCostEur`), `:341-367` (→ U2, U4);
`periodSales.test.ts` as in § 5 (P1, P2); `dashboardOverviewService.test.ts:466-470` (`realizedGain` 500,
`estimatedTax` 128,70 = 26% × (2000 − 5 − 1500)); `assetTransactionAverageCostEurBackfill.test.ts` — «is a no-op
once already backfilled» (a meta with only `averageCostEurBackfilledAt` now runs and stamps
`averageCostEurFeeFreeAt`), the flag asserted near `:142`, and «writes ONLY averageCostEur…» renamed «writes ONLY
the two PMCs» (`averageCostEur` 100, `fiscalAverageCostEur` 101); `assetTransactionsRoutes.test.ts:551`
(`averageCostEur` 90, `fiscalAverageCostEur` 90,5). Test names and comments that state the old rule are rewritten
with them: `assetService.test.ts:132,142`, `costBasisEur.test.ts:5,22-23`, `yieldOnCost.test.ts:159`,
`dashboardOverviewService.test.ts:541`, `saleTax.test.ts:12`.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators a BUY with a 5 € fee leaves the PMC at the trade price, a −5 € row
on Tracciamento that can be neither deleted nor re-amounted there, the account −1005 €, the month's Driver with
«risparmio» −5 and no «altre»; the tax simulation shows «Costo fiscale» 0,50 € per unit above the PMC.

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/assets e2e/cashflow e2e/history`.
- **B**: emulators + seed; an ETF «Ornitorinco», an account «Fenicottero» and a fee category planted.
- **C (browser, the session)**: Patrimonio at 1440 and 390 — the trade form with and without the category, the PMC
  cell, «Movimenti» (P&L fee-free, return net), the tax simulation; Tracciamento — the row, its detail, its edit.
- **D (data)**: `feeExpenseId` ↔ `feeOfTradeId`; `fiscalAverageCostEur` on the asset; `averageCostEurFeeFreeAt` on the
  meta after the first visit.
- **E (failure)**: the category deleted in the emulator UI between opening the form and saving → trade saved, no row; a
  legacy trade (`fees: 5`, no row) edited → no row, the hint «Registrata prima…».
- **F (owner, at his «pronto»)**: the mirror — PMCs lower by the fees, estimated taxes unchanged, a test buy with a fee
  and its row (both deleted after); `npm run mirror:remove`.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `perf:budget`, `mobile:census` + `mobile:budget`; remove fixtures, mirror and scripts.

## 8. Putting it into service

One PR to `develop`. No script, rule or index: each account's first Patrimonio visit re-projects its PMCs, and the
payload version 26 rebuilds the Panoramica's summary. On production the owner chooses the fee category in
Impostazioni › Spese before his first trade with a fee (without it the field stays disabled). The commit ends with
«Supersedes #489.» and `Co-authored-by: Giorgio Trentadue <148712309+Ciocc128@users.noreply.github.com>`: the PR's own
commit carries only an assistant identity, and this GitHub noreply form is the one already crediting him (`c379c993`).

## 9. Documentation

- `doc/guide/cashflow-divisione.md`: «a trade's fee row is personal to the sole holder of the asset; with a
  shared or split asset, to the sole holder of the settlement account; else in comune — written once at the
  row's creation, a member set by hand survives» (decision 43). `doc/guide/registro-operazioni.md`: the answer's
  `feeRow` and the toast «Commissione non registrata in Cashflow: manca la categoria in Impostazioni › Spese»
  (decision 44).
- `doc/guide/registro-operazioni.md`: `:21-23` «the PMC carries no fee; `fiscalAverageCostEur` keeps the purchase fees
  for the tax estimates»; `:62-69` rewritten: the fiscal gain deducts both fees (owner, 2026-11-12), with one clause of history
  WITHOUT figures, month or broker name — «until 2026-11-12 the estimate stood on the price difference alone, as a
  broker that ignores commissions withholds; it now sits below that by fees × rate, and the typed «Tasse trattenute»
  wins sale by sale»; `:89` «Mutation hooks invalidate a TRIPLE» → «four keys: … + `expenses.all`, a trade's fee
  being a row the server writes with it»; a section «The fee as a spending row» (the plan in the transaction, the legacy rule,
  the unlink on conversion, `averageCostEurFeeFreeAt`); blind spot «a legacy fee has no row and stays in «mercato»».
- `doc/guide/patrimonio.md:54-75`: two numbers — the PMC for every G/P, the fiscal cost for every tax; `:13`:
  «`costBasisPerUnitEur` = the fee-free PMC, `fiscalCostPerUnitEur` = the fiscal cost»; the asset's delete unlinks
  its trades' fee rows.
- `doc/guide/panoramica.md:225-226`: «money in = Σ buys (q × priceEur + the fee no row carries) − Σ sells (q ×
  priceEur − the fee no row carries) (`tradeMoneyIn`, `feeOutsideCashflow`)».
- `doc/guide/cashflow.md:170-187`: a trade's fee row (`feeOfTradeId`), written by the ledger, locked in the form, not
  deletable there; `doc/guide/cashflow-budget.md`: it counts in the budget; `doc/guide/rendimenti.md:76`: not a flow;
  `doc/guide/storico.md` § Storico — a verdict over tiles (the Driver's bullets): with a row «risparmio», without «mercato»; `doc/guide/assistente.md`: the suffix.
- `AGENTS.md:362-363`: «the PMC is fee-free and every tax reads `fiscalCostPerUnitEur`; a trade's fee row is planned
  and written in the trade's transaction (2026-11-12; `assetTransactionWriteTx.test.ts` W1, X1)». `AGENTS.md:350`:
  «… through `lib/utils/costBasisEur.ts`: `costBasisPerUnitEur` (the fee-free PMC) for every G/P, YOC and PMC cell,
  `fiscalCostPerUnitEur` (purchase fees included) for every tax estimate (2026-11-12)».
- `README.md:26`: «… every gain and yield on cost is measured against the euro cost of the position at the
  trade-date rates, without the commissions (a commission is a spending row of its own); every tax estimate adds the
  purchase commissions back»; (Cashflow): one sentence. `CLAUDE.md` › «Latest», `Draft Release Temp.md` («Le
  commissioni di un'operazione diventano una spesa e non pesano più sul prezzo medio»), `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **Rows for past fees**: none, by decision 21 (no heir).
- **Minusvalenze carried forward** in the estimates: still not modelled (no heir).
- **A fee row's note after a buy ↔ sell change**: written once at creation, like every fee note (no heir).
- **Bulk paths on a trade's fee row** (a category re-typed from Impostazioni): they rewrite category fields, never
  delete (no heir, declared).
- **Accumulo, the model portfolio, targeted sales**: they inherit the fiscal basis through
  `AllocatableHolding.costBasisEur` (`buildHoldings`), read by `estimatePlanSaleTax` and by NOVE-18's `saleTaxPerEuro`
  (nothing of their own here).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-07-commissioni-come-riga.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-07-commissioni-come-riga.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/registro-operazioni.md, doc/guide/patrimonio.md, doc/guide/cashflow.md,
  doc/guide/cashflow-budget.md, doc/guide/cashflow-divisione.md, doc/guide/rendimenti.md,
  doc/guide/storico.md, doc/guide/panoramica.md, doc/guide/assistente.md e doc/guide/server.md
  PRIMA di scrivere codice in quel dominio
- Leggi DESIGN.md (The Status-Is-The-Reading Rule, The Modal-Is-A-Tile Rule, The Same-Basis Rule) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta: (NOVE-03 e NOVE-06 sono già su develop) il motore con le
due basi (PMC senza commissioni, costo fiscale con) e feesEur, fiscalCostPerUnitEur e i suoi
lettori, tradeFeeExpense.ts dalla PR #489 di Ciocc128 (refs/tmp/pr489) con le modifiche della
§ 4 (la PR entra con git cherry-pick --no-commit 9d163bb1; fermati se un conflitto tocca un
file che la § 4 non nomina), il piano della commissione DENTRO la transazione di commitTradeMutation, lo sgancio in
deleteAllAssetTransactionsForAsset e nell'eliminazione dello strumento, la riproiezione con averageCostEurFeeFreeAt, tradeMoneyIn in
marketEffect.ts, Rendimenti, le superfici di Cashflow, TransactionDialog, l'AI. I test PRIMA del
codice, uno per riga della § 6, ciascuno visto rosso con la sua mutazione; cifre inventate e
tonde, le fixture e i commenti da estratti conto sostituiti (§ 5). Fermati e chiedimi se: un test
esistente diventa rosso per un motivo che non è il nuovo contratto (§ 6 elenca quelli attesi);
perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina; un anno del
Driver non torna più alla somma dei suoi mesi. Collaudo: § 7, la F sul mirror al mio
«pronto». Un branch, un commit con «Supersedes #489.» e il trailer Co-authored-by della § 8, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec on a shared contract (the ledger's transaction writing to two
collections at once, the PMC every page reads) with a data re-projection. Estimated size: 1 long session, ~6 h (decision 35: one branch, one commit; resumed on the same branch, without committing, when the context runs out);
~200 lines of engine and use case, ~120 of surfaces, ~600 of tests.
