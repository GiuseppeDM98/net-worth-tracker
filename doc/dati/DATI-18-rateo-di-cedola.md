# DATI-18 — A bond's accrued interest: paid at the purchase, received at the sale, a row of its own

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-04 (the announced-dividend reconciliation it
> must not be caught by) and DATI-06 (the trade form, the trade's validation and the prepare step it edits too).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 12 (added at the end of the planning
> session); decisions 31, 32, 33.

## 1. The problem today (evidence on the code)

Who buys a bond between two coupon dates pays the seller the interest accrued so far (the «rateo»); the broker
debits clean price × nominal + rateo + fee and, at the coupon date, credits the WHOLE coupon. Who sells receives
the rateo. Today the app knows nothing of it (no `rateo`, no `accrued interest` in `lib/`, `components/`, `app/`,
`types/`):

- A trade settles `quantity × priceEur ± fees` and, on a sale, minus the withheld tax (`computeCashDelta`,
  `lib/utils/assetTransactionUtils.ts:371-376`): the account ends above the statement by the rateo paid.
- The trade's shape has no field for it (`AssetTransaction`, `types/assetTransactions.ts:44-74`; the API schema,
  `lib/server/validation.ts:89-103`).
- The first coupon after a purchase is recorded whole (`createDividendWithOptionalExpense`,
  `lib/server/dividendUseCase.ts:68-128`; the income row at the payment day, `runExpenseCreation`,
  `lib/server/dividendProcessor.ts:200-`): the bond's income of the period and its total return in Dividendi
  (`app/api/dividends/stats/route.ts:242-255`, the net of every row of the instrument) are overstated by the rateo.
- The coupon calendar the proposal needs exists (`getFollowingCouponDate`, `getApplicableCouponRate`,
  `calculateCouponPerShare`, `lib/utils/couponUtils.ts:140-216`; `BondDetails`, `types/assets.ts:128-140`).
- The pattern of «a row its trade owns» exists for the fee: written inside the trade's transaction, moving no
  account, locked in Cashflow, skipped by Rendimenti (`lib/utils/tradeFeeExpense.ts:1-23`; the write,
  `lib/server/assetTransactionUseCase.ts:618-632`; the locks, `components/cashflow/TransactionFeed.tsx:262-287`,
  `components/expenses/ExpenseTable.tsx:266-279`, `components/expenses/ExpenseDialog.tsx:1538`).
- Rendimenti reads an income row of the dividend category as the portfolio's return, never as a contribution
  (`lib/services/performanceService.ts:738-742`), and the coupon's tax is the instrument's rate, else 26%
  (`lib/server/dividendProcessor.ts:429-430`).

## 2. Goal and acceptance criteria

1. A purchase or a sale of a bond in euro has an optional field, «Rateo pagato» / «Rateo incassato», in euro.
   Proof: D1, V1.
2. The settlement account moves by it with the trade: a purchase debits price + fee + rateo, a sale credits price −
   fee − withheld tax + rateo; an edit and a delete reverse and re-apply to the cent. Proof: U1, T1.
3. The price of carry, the realised result and the fiscal cost do not change: the rateo is interest, not capital.
   Proof: U2.
4. Dividendi gains one row per trade with a rateo — «Rateo pagato» negative at a purchase, «Rateo incassato»
   positive at a sale, dated at the trade — written with the trade and never apart from it; the next coupon stays
   whole. Proof: T2, T3.
5. When the dividend income category is set, the Cashflow gains the matching income row (negative at a purchase),
   on the trade's date, moving NO account, locked like a fee row. Proof: T4, D3.
6. The form proposes the amount — the days accrued to the value date (T+2) over the coupon period, on the quantity,
   net of the instrument's tax rate (26% when it has none, the coupons' rule) — for a plain coupon bond; the owner
   overwrites it with the statement's figure.
   No proposal for an inflation-linked bond or one paying a single coupon at maturity: the field stays empty.
   Proof: U3–U6, D2.
7. No reader takes the row for a coupon: the daily income pass, the announced-dividend reconciliation and the
   dividend-growth figure skip it; Rendimenti reads the Cashflow row as dividend income (negative when paid), never
   as a contribution or a withdrawal. Proof: T5, T6, U7.
8. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green.

## 3. Decisions

- **Decision 31** (owner, 2026-11-23): the accrued interest of a bond is handled in this series, as a spec of its
  own.
- **Decision 32** (owner, 2026-11-23, after asking how brokers do it): as the statement — the trade debits the
  rateo, the coupon stays whole, and Dividendi carries a row of its own («Rateo pagato» negative at the purchase,
  «Rateo incassato» positive at the sale); the price of carry stays the clean price.
- **Decision 33** (owner, 2026-11-23): the amount is proposed by the app and editable.
- Adopted, reversible:
  - (a) the field is the amount the statement shows — for a private investor the rateo NET of the substitute tax;
    the row's gross equals its net and its tax is zero.
  - (b) the two rows have a deterministic id, `accrued_{tradeId}`, so the trade's transaction writes or deletes
    them without reading them.
  - (c) the proposal accrues to the value date, two working days after the trade (weekends skipped, holidays not),
    on calendar days (actual/actual).
  - (d) bonds in euro only; a bond in another currency has no field.
  - (e) the rows are edited only through their trade; Dividendi and Cashflow show them locked.
  - (f) a trade saved before this spec has no rateo; editing it and typing one writes the rows from then on.
  - (g) the proposal's tax is the rule of the coupons: the instrument's `taxRate` when positive, else 26%.

## 4. Solution

### 4.1 The rule — `lib/utils/accruedInterest.ts` (new, written here)

```ts
/**
 * A bond's accrued interest (2026-11-23). Who buys between two coupon dates pays the seller the
 * interest accrued so far and then receives the WHOLE coupon; who sells receives it. The broker
 * settles it with the trade, so the trade moves the account by it — and it is interest, not
 * capital: the price of carry never sees it. In Dividendi it is a row of its own, negative when
 * paid, so the bond's income is the coupon minus what was paid for it.
 * SDK-free: plain values in, documents out.
 */
import type { Asset, BondDetails } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import { effectiveBondNominal } from '@/lib/utils/bondPricing';
import { roundToCents } from '@/lib/utils/cents';
import {
  calculateCouponPerShare,
  getApplicableCouponRate,
  getFollowingCouponDate,
  isSingleCouponAtMaturity,
  resolveInflationIndexation,
} from '@/lib/utils/couponUtils';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

export const ACCRUED_DIVIDEND_TYPE = 'accrued';
export const ACCRUED_SETTLEMENT_LAG_DAYS = 2;
/** The coupons' rule (`dividendProcessor.ts`): the instrument's rate when it has one, else this. */
export const ACCRUED_DEFAULT_TAX_RATE = 26;

/** The id of the Dividendi row and of the Cashflow row of a trade's accrued interest. */
export function accruedRowId(tradeId: string): string {
  return `accrued_${tradeId}`;
}

/** What a stored trade carries: a positive euro amount on a purchase or a sale, else nothing. */
export function accruedInterestOf(trade: Pick<AssetTransaction, 'type' | 'accruedInterestEur'> | null | undefined): number {
  if (!trade || trade.type === 'adjustment') return 0;
  const amount = trade.accruedInterestEur ?? 0;
  return amount > 0 ? roundToCents(amount) : 0;
}

/** Signed as money: paid at a purchase (negative), received at a sale (positive). */
export function signedAccrued(trade: Pick<AssetTransaction, 'type' | 'accruedInterestEur'>): number {
  const amount = accruedInterestOf(trade);
  return trade.type === 'buy' ? -amount : amount;
}

const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const fromDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** The value date: two working days after the trade's Italian day (Saturdays and Sundays skipped). */
export function settlementDayIso(tradeDayIso: string): string {
  let day = toDay(tradeDayIso);
  let left = ACCRUED_SETTLEMENT_LAG_DAYS;
  while (left > 0) {
    day += 1;
    const weekday = new Date(day * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return fromDay(day);
}

/** The coupon period a day falls in: from the last coupon date (or the issue) to the next one. */
export function couponPeriodAround(
  details: Pick<BondDetails, 'issueDate' | 'maturityDate' | 'couponFrequency'>,
  dayIso: string
): { startIso: string; endIso: string; end: Date } | null {
  if (isSingleCouponAtMaturity(details.couponFrequency)) return null;
  let start = details.issueDate;
  // 1.200 periods is a century of monthly coupons: a guard, never reached.
  for (let guard = 0; guard < 1200; guard++) {
    const end = getFollowingCouponDate(start, details.couponFrequency, details.maturityDate);
    if (!end) return null;
    const startIso = getItalyDateIso(start);
    const endIso = getItalyDateIso(end);
    if (dayIso < endIso) return startIso <= dayIso ? { startIso, endIso, end } : null;
    start = end;
  }
  return null;
}

export interface AccruedProposal {
  /** Euro, net of `taxRate`. */
  amount: number;
  days: number;
  periodDays: number;
  /** The rate applied, in percent: the instrument's, else `ACCRUED_DEFAULT_TAX_RATE`. */
  taxRate: number;
}

/**
 * The amount the form proposes: the period's coupon on the quantity, for the days from the last
 * coupon to the value date. Null when the app cannot tell — not a bond in euro, no coupon data, an
 * inflation-linked bond (its coupon is not known in advance), a single coupon at maturity, or
 * nothing accrued yet.
 */
export function proposeAccruedInterest(
  asset: Pick<Asset, 'type' | 'currency' | 'taxRate' | 'bondDetails'>,
  quantity: number,
  tradeDayIso: string
): AccruedProposal | null {
  const details = asset.bondDetails;
  if (asset.type !== 'bond' || !details || !(quantity > 0)) return null;
  if ((asset.currency ?? 'EUR').toUpperCase() !== 'EUR') return null;
  if (resolveInflationIndexation(details) !== null) return null;
  const valueDayIso = settlementDayIso(tradeDayIso);
  const period = couponPeriodAround(details, valueDayIso);
  if (!period) return null;

  const rate = getApplicableCouponRate(period.end, details.issueDate, details.couponRate, details.couponRateSchedule);
  const perUnit = calculateCouponPerShare(rate, effectiveBondNominal(details.nominalValue), details.couponFrequency);
  const periodDays = toDay(period.endIso) - toDay(period.startIso);
  const days = toDay(valueDayIso) - toDay(period.startIso);
  if (!(perUnit > 0) || periodDays <= 0 || days <= 0) return null;

  const gross = perUnit * quantity * (days / periodDays);
  const taxRate = asset.taxRate && asset.taxRate > 0 ? asset.taxRate : ACCRUED_DEFAULT_TAX_RATE;
  const amount = roundToCents(gross * (1 - taxRate / 100));
  return amount > 0 ? { amount, days, periodDays, taxRate } : null;
}

/** «12 giorni su 182, al netto del 12,5%» — the line under the proposed field. */
export function describeAccruedProposal(proposal: AccruedProposal): string {
  const rate = proposal.taxRate.toLocaleString('it-IT');
  return `Proposto: ${proposal.days} giorni su ${proposal.periodDays}, al netto del ${rate}%. Correggilo con la cifra dell'estratto.`;
}

export const ACCRUED_LABELS = {
  buy: 'Rateo pagato',
  sell: 'Rateo incassato',
} as const;

/** The Dividendi row of a trade's accrued interest. */
export function buildAccruedDividendDoc(input: {
  userId: string;
  trade: Pick<AssetTransaction, 'id' | 'assetId' | 'type' | 'date' | 'quantity' | 'accruedInterestEur'>;
  asset: { ticker: string; name: string; isin?: string };
  /** The Cashflow row written with it, when there is one. */
  expenseId?: string;
  now: Date;
}): Record<string, unknown> {
  const signed = signedAccrued(input.trade);
  return {
    userId: input.userId,
    assetId: input.trade.assetId,
    assetTicker: input.asset.ticker,
    assetName: input.asset.name,
    ...(input.asset.isin ? { assetIsin: input.asset.isin } : {}),
    exDate: input.trade.date,
    paymentDate: input.trade.date,
    dividendPerShare: input.trade.quantity > 0 ? signed / input.trade.quantity : 0,
    quantity: input.trade.quantity,
    grossAmount: signed,
    taxAmount: 0,
    netAmount: signed,
    currency: 'EUR',
    dividendType: ACCRUED_DIVIDEND_TYPE,
    notes: input.trade.type === 'buy' ? "Rateo pagato all'acquisto" : 'Rateo incassato alla vendita',
    isAutoGenerated: true,
    sourceTradeId: input.trade.id,
    ...(input.expenseId ? { expenseId: input.expenseId } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** The Cashflow row: an income of the dividend category, signed, on the trade's date, with NO account. */
export function buildAccruedExpenseDoc(input: {
  userId: string;
  trade: Pick<AssetTransaction, 'id' | 'type' | 'date' | 'accruedInterestEur'>;
  assetLabel: string;
  category: { categoryId: string; categoryName: string; subCategoryId?: string; subCategoryName?: string };
  now: Date;
}): Record<string, unknown> {
  const { category } = input;
  return {
    userId: input.userId,
    type: 'income',
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    ...(category.subCategoryId ? { subCategoryId: category.subCategoryId } : {}),
    ...(category.subCategoryName ? { subCategoryName: category.subCategoryName } : {}),
    amount: signedAccrued(input.trade),
    currency: 'EUR',
    date: input.trade.date,
    notes: `${ACCRUED_LABELS[input.trade.type === 'buy' ? 'buy' : 'sell']} — ${input.assetLabel}`,
    isRecurring: false,
    accruedOfTradeId: input.trade.id,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
```

### 4.2 Types and validation

- `types/assetTransactions.ts`: `AssetTransaction` and `AssetTransactionFormData` gain `accruedInterestEur?: number`
  («a bond's accrued interest settled with the trade, EUR (> 0): paid on a buy, received on a sell; never in the
  PMC»).
- `types/dividend.ts`: `DividendType` gains `'accrued'`; `Dividend` gains `sourceTradeId?: string`.
- `types/expenses.ts` (beside `feeOfTradeId`, `:147`): `accruedOfTradeId?: string`.
- `lib/constants/dividendTypes.ts` (`:26-32`): `accrued: 'Rateo'`; the type is NOT added to the options of the
  dividend form's select, nor to `dividendDataSchema`'s enum (`lib/server/validation.ts:57-64`): the dividend API
  cannot create one.
- `lib/server/validation.ts` (`:89-103`): `accruedInterestEur: z.number().finite().min(0).optional()`; the cross-field
  refine refuses it on an `adjustment`. The use case's semantic validation (beside `assertCashSettlementAsset`,
  `assetTransactionUseCase.ts:285`) refuses a positive value on an asset that is not a `bond` in EUR: 422, «Il rateo
  riguarda solo le obbligazioni in euro.» A 0 clears it (stored absent), as an empty field does.

### 4.3 The ledger — `lib/utils/assetTransactionUtils.ts`, `lib/server/assetTransactionUseCase.ts`

- `computeCashDelta` (`:371-376`):

```ts
export function computeCashDelta(t: AssetTransaction): number {
  if (!t.linkedCashAssetId || t.type === 'adjustment') return 0;
  const fees = t.fees ?? 0;
  // A bond's accrued interest is settled with the trade: paid by who buys, received by who sells.
  const accrued = accruedInterestOf(t);
  if (t.type === 'buy') return roundToCents(-(t.quantity * t.priceEur + fees + accrued));
  return roundToCents(t.quantity * t.priceEur - fees - (t.withheldTaxEur ?? 0) + accrued); // sell
}
```

  The replay, `buildXirrFlows`, `computeAssetTotalReturn` and `computeInvestedCapital` are NOT touched. The vitals
  of «Movimenti» are on the price alone (they pass no dividend, `AssetMovementsDialog.tsx:102-104`) and stay so;
  the rateo reaches the instrument's total return in Dividendi as a row of the instrument (the stats route sums
  the net of every row) and Rendimenti as dividend income.
- The trade's document builders (`:115-117`, `:137-139`, `:161-163`, the merge of an update `:352-362`, the
  «needs a new settlement» test `:230-231`) carry `accruedInterestEur` exactly as they carry `withheldTaxEur`
  (stored only when > 0; `FieldValue.delete()` on an update that clears it).
- Prepare (create and update): when the new trade or the stored one has a rateo, read
  `resolveDividendIncomeCategory(ownerId)` (`lib/server/dividendUseCase.ts:28`) BEFORE the transaction and keep it on
  the plan (`accruedCategory`); nothing is read for a trade without one.
- Commit, a fifth write after the fee row (`:618-632`), blind (no read: the ids are deterministic):

```ts
// w5: the accrued-interest rows, with their trade or not at all. They move no account: the settlement did.
const accruedId = accruedRowId(plan.tradeRef.id);
const accruedDividendRef = adminDb.collection('dividends').doc(accruedId);
const accruedExpenseRef = adminDb.collection('expenses').doc(accruedId);
if (plan.op === 'delete' || accruedInterestOf(tradeToWrite) === 0) {
  tx.delete(accruedDividendRef);
  tx.delete(accruedExpenseRef);
} else {
  const assetData = assetSnap.data();
  const label = (assetData?.ticker as string | undefined) || (assetData?.name as string | undefined) || '';
  const withExpense = Boolean(plan.accruedCategory);
  tx.set(accruedDividendRef, buildAccruedDividendDoc({
    userId: plan.ownerId, trade: tradeToWrite!, now: new Date(),
    asset: { ticker: (assetData?.ticker as string) ?? '', name: (assetData?.name as string) ?? '', isin: assetData?.isin as string | undefined },
    expenseId: withExpense ? accruedId : undefined,
  }));
  if (withExpense) tx.set(accruedExpenseRef, buildAccruedExpenseDoc({ userId: plan.ownerId, trade: tradeToWrite!, assetLabel: label, category: plan.accruedCategory!, now: new Date() }));
  else tx.delete(accruedExpenseRef);
}
```

  The response gains `accruedRow: 'written' | 'none'` (`TradeMutationResult`, `:80-91`).
- `deleteAllAssetTransactionsForAsset`'s server path (the bulk delete that unlinks the fee rows,
  `assetTransactionUseCase.ts:723-`): it also deletes, per deleted trade, the two `accrued_{tradeId}` documents.

### 4.4 The readers that must not take it for a coupon

- `lib/server/dividendProcessor.ts`, `runExpenseCreation` (`:200-`): a dividend with `dividendType === 'accrued'` is
  skipped (its Cashflow row was written with its trade, or there is none by design).
- `lib/utils/dividendEntitlement.ts` (DATI-04), `reconcileAnnouncedDividend`: an `'accrued'` row is never a
  candidate (it is dated at its trade; the guard makes it explicit).
- `app/api/dividends/stats/route.ts:343`: the dividend-growth filter excludes `'accrued'` with `'coupon'` and
  `'finalPremium'`.
- `lib/utils/tradeFeeExpense.ts`: a new predicate beside `isTradeFeeRow` (`:66`):

```ts
/** A row its trade owns — the fee, the accrued interest: amount, date and account are the trade's. */
export function isTradeOwnedRow(row: Pick<Expense, 'feeOfTradeId' | 'accruedOfTradeId'>): boolean {
  return !!row.feeOfTradeId || !!row.accruedOfTradeId;
}
```

  used in place of `isTradeFeeRow` where a row is LOCKED (`TransactionFeed.tsx:262-287`, `ExpenseTable.tsx:266-279`,
  `ExpenseDialog.tsx:1538` — the fee-row edit mode: category and note only). `performanceService.ts:726` and `:797`
  keep `isTradeFeeRow`: the rateo row is NOT skipped there, it is an income of the dividend category and falls in
  `dividendIncome` by the branch at `:738-742`, negative when paid. `isFeeRow` (`lib/utils/expenseFee.ts:54`) is
  unchanged: a rateo is not a fee. The delete tooltip is the existing `TRADE_FEE_ROW_DELETE_BLOCKED` («Si elimina con la sua operazione, in
  Patrimonio»).
- Dividendi (`components/dividends/DividendTable.tsx` and the record's details dialog): an `'accrued'` row shows the
  type «Rateo», its signed amount, and in place of «Modifica» / «Elimina» the line «Segue la sua operazione: si
  modifica da Patrimonio › Movimenti». It is always «incassato» (its date is its trade's).
- «Movimenti» (`components/assets/AssetMovementsDialog.tsx`): a trade's details show «Rateo pagato {eur}» /
  «Rateo incassato {eur}».

### 4.5 The form — `components/assets/TransactionDialog.tsx`

For `asset.type === 'bond'` in EUR and a buy or a sell, a field under the fee: label `ACCRUED_LABELS[type]` + « (€)»,
optional, `z.number().min(0).optional().or(z.nan())` (`accruedInterestEur`, the schema at `:100-125`).

- On create, `proposeAccruedInterest(asset, quantity, dateIso)` is recomputed when quantity or date change and
  fills the field WHILE the user has not typed in it (a `touched` flag, the pattern of «Tasse trattenute»); under
  the field `describeAccruedProposal(...)`; with no proposal the field is empty and the line reads «Scrivi il rateo
  dell'estratto, se c'è.»
- On edit the stored value is shown and nothing is proposed.
- The total preview of the dialog adds the rateo to the debit (buy) or to the credit (sell).
- The payload sends `accruedInterestEur` when > 0, and `0` on an edit that clears a stored one.

## 5. Constraints and traps

- **The PMC stands on price × quantity alone** (`tradeFeeExpense.ts:5-7`; doc/guide/registro-operazioni.md): the
  rateo never enters `replayTransactions`, the fiscal cost or the realised result.
- **A row its trade owns moves NO account** (`tradeFeeExpense.ts:12-13`): `computeCashDelta` already settled it; the
  Cashflow row has no `linkedCashAssetId`.
- **All reads before writes** in the trade's transaction: the two rows are written blind at deterministic ids; the
  category is read in the prepare step.
- **Received and announced are never one figure** (doc/guide/cashflow-dividendi.md): a rateo is received, on its
  trade's date; it is never in «annunciati».
- **A negative income row is a row like any other** (doc/guide/cashflow.md § Expense Sign Convention): income sums
  are signed; no `Math.abs`.
- **Cents** (`roundToCents`): what reaches an account is rounded; a reversal cancels its application exactly.
- **Italian day** for the trade's day and the coupon dates (`getItalyDateIso`); fixtures at noon; the day
  arithmetic is on UTC midnights of ISO days, zone-free.
- **Shared account**: every write is by `ownerId` (the plan's), as the fee row's.
- **No owner data**: a «BTP Alfa 4%» with semi-annual coupons on round dates, nominal 10.000.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/assetTransactionUtils.test.ts` | a buy of 10.000 at 0,99 with fee 5 and rateo 60 debits 9.965; a sell with withheld tax 20 and rateo 60 credits price − fee − 20 + 60; an adjustment 0; no rateo → today's figures | rateo subtracted on a sell |
| U2 | unit · same | the replay of a history with rateo on a buy and a sell gives the same quantity, PMC, fiscal cost and realised result as without | rateo in the cost basis |
| U3 | unit · `__tests__/accruedInterest.test.ts` | semi-annual 4% on 10.000, last coupon 1 March, trade on a Tuesday → value date Thursday; days and period counted; the gross × (1 − 12,5%) to the cent | trade date in place of the value date |
| U4 | unit · same | a trade on a Friday settles on Tuesday; the day before a coupon date settles after it → the days restart from that coupon | weekends counted |
| U5 | unit · same | no proposal for: a share, a bond in USD, an inflation-linked bond, a single coupon at maturity, quantity 0, a day after the maturity; a bond with no tax rate → net of 26% | propose for a BTP Italia |
| U6 | unit · same | a step-up bond uses the tier of the period's coupon date; the two documents: a buy → negative amounts, type `accrued`/`income`, the ids, no account on the Cashflow row; a sell → positive | positive on a buy |
| U7 | unit · `__tests__/tradeFeeExpense.test.ts`, `__tests__/performanceService.test.ts` | `isTradeOwnedRow` is true for a fee row and a rateo row, `isTradeFeeRow` false for a rateo row; in Rendimenti a rateo row of −60 in the dividend category lowers `dividendIncome` by 60 and leaves the net cash flow alone | rateo row skipped as a fee row |
| V1 | unit · `__tests__/serverValidation.test.ts` | the trade schema accepts `accruedInterestEur: 60` on a buy, refuses a negative and one on an adjustment; the dividend schema refuses `dividendType: 'accrued'` | open enum |
| T1 | unit · `__tests__/assetTransactionWriteTx.test.ts` | create with a rateo debits the account by it; an edit from 60 to 45 moves the account by 15; a delete restores it; a rateo on a share → 422 | no reversal |
| T2 | unit · same | create writes the Dividendi row at `accrued_{tradeId}` (negative, type `accrued`, `sourceTradeId`); an edit rewrites it; clearing the rateo or deleting the trade deletes it | row left behind |
| T3 | unit · same | a trade with no rateo reads no category and writes neither row | category always read |
| T4 | unit · same | with the dividend category set the Cashflow row exists (income, negative, no account, `accruedOfTradeId`) and the Dividendi row names it; with none set there is no Cashflow row and no `expenseId` | account on the row |
| T5 | unit · `__tests__/dividendProcessor.test.ts` | the income pass skips an `accrued` dividend with no `expenseId` | create a second income |
| T6 | unit · `__tests__/dividendEntitlement.test.ts` | an `accrued` row is never reconciled | recompute its quantity |
| D1 | dom · `__tests__/transactionDialogAccrued.test.tsx` (new) | the field shows for a bond in EUR on buy and sell with the right label; not for a share, not for an adjustment | field on every type |
| D2 | dom · same | the proposal fills the field and prints its line; typing keeps the typed value when the date changes; on edit nothing is proposed | overwrite the typed value |
| D3 | dom · `__tests__/accruedRowLocks.test.tsx` (new) | a rateo row is locked in Cashflow with the tooltip; in Dividendi it reads «Rateo», signed, with no edit and no delete | edit allowed |
| E1 | e2e · `e2e/assets.accrued-interest.spec.ts` (new) | buy a seeded bond with a rateo: the account drops by price + rateo, Dividendi shows «Rateo» negative on the trade's date, Cashflow a locked income row; delete the trade → the three effects are gone | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: buying the seeded «BTP Alfa 4%» with a proposed rateo debits the account by price
+ fee + rateo; Dividendi shows «Rateo» with a negative amount on the trade's date and the next coupon whole; the
price of carry is the clean price; deleting the trade removes every trace.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390: B the purchase with the
  proposal accepted; C the proposal overwritten, then the trade edited (the account and the rows follow); D a sale
  with «Rateo incassato»; a bond with no proposal (inflation-linked): the field empty with its line; E the dividend
  category unset (no Cashflow row, the Dividendi row there), the delete of the trade, the shared account. Decoys:
  «ornitorinco» (a share: no field) and «fenicottero» (a rateo row in Cashflow: «Elimina» disabled).
- F — at the owner's «pronto», on the mirror: one bond purchase checked against his broker's statement (the debit
  to the cent, the proposed rateo against the statement's).

## 8. Putting it into service

No rules, no index: the two rows are written by the Admin SDK in collections that exist; the client reads them as
any dividend and any expense. No migration: a trade saved before has no rateo (adopted (f)). The owner may edit
his past bond purchases and type their rateo: each edit moves the account by it — say so in the release note.

## 9. Documentation

- `doc/guide/registro-operazioni.md` — § «Accrued interest» (the field, the settlement, why it is not in the PMC,
  the two rows and their ids, the proposal's rule and its limits); § blind spots: bonds in euro only; no proposal
  for inflation-linked bonds and single-coupon bonds; holidays are not in the value date; the row's gross equals
  its net; the vitals of «Movimenti» stay on the price alone; with no dividend category the Cashflow has no row and the Driver reads the rateo among the other
  changes.
- `doc/guide/cashflow-dividendi.md` — the type «Rateo»: always received, locked, signed.
- `doc/guide/cashflow.md` — a row its trade owns: the fee and the rateo (`isTradeOwnedRow`).
- `doc/guide/rendimenti.md` — the rateo's Cashflow row is dividend income, negative when paid: a return of the
  portfolio, never a contribution.
- `README.md` — the trade ledger's feature lines. `AGENTS.md` § 3 — the stub of Registro operazioni.
- `CLAUDE.md` — Registro operazioni line: «a bond's accrued interest settled with the trade, a row of its own in
  Dividendi (2026-11)», under 20.000 characters.
- `Draft Release Temp.md` — «Obbligazioni: il rateo di cedola pagato all'acquisto e incassato alla vendita, proposto
  dall'app e registrato come riga a sé nei Dividendi».
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- A bond in another currency → doc/guide/registro-operazioni.md § blind spots.
- The proposal for an inflation-linked bond (BTP Italia, BTP€i) and a single-coupon bond →
  doc/guide/registro-operazioni.md § blind spots (the field takes the statement's figure).
- The rateo's gross and tax as separate figures → doc/guide/cashflow-dividendi.md § blind spots.
- The rateo in the card of a bond told to the Assistente → doc/guide/assistente-registra.md § blind spots (DATI-16
  opens the form, which has the field).
- A market calendar for the value date → doc/guide/registro-operazioni.md § blind spots.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-18-rateo-di-cedola.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi, regole della serie)
- Leggi doc/guide/registro-operazioni.md, doc/guide/cashflow-dividendi.md, doc/guide/cashflow.md,
  doc/guide/rendimenti.md, doc/guide/server.md e doc/guide/dialog.md PRIMA di scrivere codice in quei
  domini
- Tocca la UI: leggi DESIGN.md e PRODUCT.md prima di disegnare
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: la regola pura con U3–U6 (ognuno visto rosso con la
sua mutazione), i tipi e la validazione (V1), il regolamento e il replay (U1, U2), le due righe scritte
con l'operazione (T1–T4), i lettori che non devono scambiarla per una cedola né per una commissione (T5, T6, U7), il modulo
dell'operazione (D1, D2), Cashflow e Dividendi (D3), poi E1. Il codice dei §§ 4.1 e 4.3 è già scritto:
copialo.

Fermati e chiedimi se: DATI-04 o DATI-06 non sono in develop come li descrivono le loro spec, il prezzo
di carico o il risultato realizzato cambiano per una operazione con rateo, oppure la transazione
dell'operazione dovrebbe leggere un documento in più.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec on the trade ledger's money path: the settlement changes and two
documents are written inside the trade's transaction. Estimated size: L (one pure module, the ledger's settlement
and commit, the form, the readers, 19 tests).
