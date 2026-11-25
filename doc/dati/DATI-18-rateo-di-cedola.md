# DATI-18 — A bond's accrued interest: paid at the purchase, received at the sale, a row of its own

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-04 (contract C8: `settlementDayIso`, the
> announced-dividend reconciliation it must not be caught by), DATI-06 (the ONE purchase form, the trade's
> validation and its `null` = remove convention) and DATI-15 (the Assistente's ledger tool, which gains the rateo).
> DATI-20 and DATI-21 edit the same form after it. Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a
> line number is a hint, the function's name is the anchor). Owner's point 12; decisions 31, 32, 33, 51, 86, 87.

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
   whole. Proof: T2, T3, D3.
5. When the dividend income category is set, the Cashflow gains the matching income row (negative at a purchase),
   on the trade's date, moving NO account, with no «Modifica» and no «Elimina». Proof: T4, D3.
6. The form proposes the amount — the days accrued to the value date (T+2, DATI-04's) over the coupon period, on
   the quantity, net of the instrument's tax rate (26% when it has none, the coupons' rule) — for a plain coupon
   bond; the owner overwrites it with the statement's figure. No proposal for an inflation-linked bond or one
   paying a single coupon at maturity: the field stays empty. Proof: U3–U6, D2.
7. A rateo typed on a trade of a month already over writes its rows in that month, and the form says so before
   the save. Proof: U8, D2.
8. No reader takes the row for a coupon: the daily income pass, «Sincronizza» of Impostazioni › Dividendi, the
   announced-dividend reconciliation, the dividend-growth figure and the reliability of the income skip it;
   Rendimenti reads the Cashflow row as dividend income (negative when paid), never as a contribution or a
   withdrawal. Proof: T5, T6, T7, T8, U7, U9.
9. The rows of trades deleted in bulk (the instrument changes type) STAY, unlinked, as plain rows: the money
   moved. Proof: T9.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
    `npm run perf:budget` green with `/dashboard/assets` and `/dashboard/allocation` inside their ceilings, raised
    by no more than 1 KB gz and only with the register row (index § 8 rule 7).

## 3. Decisions

- **Decision 31** (owner, 2026-11-23): the accrued interest of a bond is handled in this series, as a spec of its
  own.
- **Decision 32** (owner, 2026-11-23, after asking how brokers do it): as the statement — the trade debits the
  rateo, the coupon stays whole, and Dividendi carries a row of its own («Rateo pagato» negative at the purchase,
  «Rateo incassato» positive at the sale); the price of carry stays the clean price.
- **Decision 33** (owner, 2026-11-23): the amount is proposed by the app and editable.
- **Decision 51** (owner, 2026-11-23): the coupon and the rateo both stand on the value date, T+2: ONE function,
  `settlementDayIso` of DATI-04.
- **Decision 86** (owner, 2026-11-23): when the bond changes type and its trades are deleted in bulk, the rateo's
  rows STAY, unlinked — as the fee rows do.
- **Decision 87** (owner, 2026-11-23): the rows are dated at the trade, also in a month already over; the form
  warns («scrive una riga in {mese}»).
- Adopted, reversible:
  - (a) the field is the amount the statement shows — for a private investor the rateo NET of the substitute tax;
    the row's gross equals its net and its tax is zero.
  - (b) the two rows have a deterministic id, `accrued_{tradeId}`.
  - (c) the proposal accrues to the value date on calendar days (actual/actual).
  - (d) bonds in euro only; a bond in another currency has no field.
  - (e) the rows are changed only through their trade: Dividendi and Cashflow show them with no «Modifica» and
    no «Elimina», and the dividend API refuses them while they name a trade.
  - (f) a trade saved before this spec has no rateo; editing it and typing one writes the rows from then on.
  - (g) the proposal's tax is the rule of the coupons: the instrument's `taxRate` when positive, else 26%.
  - (h) the dividend category, the bond's type and its currency are decided INSIDE the trade's transaction, as
    the module's rule wants (`assetTransactionUseCase.ts`, «every write decides inside its own transaction»).
  - (i) a Cashflow row that exists follows its trade even when the dividend category has been unset since, in
    the category it was written in — the fee row's rule.
  - (j) the Cashflow row takes the person the fee row takes (`tradeFeeOwner`): in the Divisione it is that
    person's, not a shared income.
  - (k) changing the type of a trade in the form empties the field: a rateo paid is not one received.

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
import type { Expense } from '@/types/expenses';
import { MONTH_NAMES } from '@/lib/constants/months';
import { effectiveBondNominal } from '@/lib/utils/bondPricing';
import { roundToCents } from '@/lib/utils/cents';
import {
  calculateCouponPerShare,
  getApplicableCouponRate,
  getFollowingCouponDate,
  isSingleCouponAtMaturity,
  resolveInflationIndexation,
} from '@/lib/utils/couponUtils';
import { getItalyDateIso, toDate } from '@/lib/utils/dateHelpers';
import { settlementDayIso } from '@/lib/utils/dividendEntitlement';

export const ACCRUED_DIVIDEND_TYPE = 'accrued';
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

/** The Cashflow row of a rateo still tied to its trade: no edit and no delete in Cashflow. */
export function isAccruedRow(row: Pick<Expense, 'accruedOfTradeId'>): boolean {
  return !!row.accruedOfTradeId;
}

const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** The coupon period a day falls in: from the last coupon date (or the issue) to the next one. */
export function couponPeriodAround(
  details: Pick<BondDetails, 'issueDate' | 'maturityDate' | 'couponFrequency'>,
  dayIso: string
): { startIso: string; endIso: string; end: Date } | null {
  if (isSingleCouponAtMaturity(details.couponFrequency)) return null;
  // In the browser a bond's dates are Firestore Timestamps: every reader converts them.
  const maturity = toDate(details.maturityDate);
  let start = toDate(details.issueDate);
  // 1.200 periods is a century of monthly coupons: a guard, never reached.
  for (let guard = 0; guard < 1200; guard++) {
    const end = getFollowingCouponDate(start, details.couponFrequency, maturity);
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
 * inflation-linked bond (its coupon is not known in advance), a single coupon at maturity, a
 * zero-coupon bond, or nothing accrued yet.
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

  const rate = getApplicableCouponRate(period.end, toDate(details.issueDate), details.couponRate, details.couponRateSchedule);
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

/** A rateo on a trade of a month already over writes its rows in that month (owner, 2026-11-23): the form says so. */
export function describeAccruedPastMonth(tradeDayIso: string, todayIso: string): string | null {
  if (tradeDayIso.slice(0, 7) >= todayIso.slice(0, 7)) return null;
  const [year, month] = tradeDayIso.split('-').map(Number);
  return `Il rateo scrive una riga in ${MONTH_NAMES[month - 1].toLowerCase()} ${year}: Cashflow e Dividendi di quel mese cambiano.`;
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
  /** The person the row is of in the Divisione: the fee row's rule (`tradeFeeOwner`). */
  personalMemberId?: string;
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
    notes: accruedRowNote(input.trade.type, input.assetLabel),
    isRecurring: false,
    accruedOfTradeId: input.trade.id,
    ...(input.personalMemberId ? { personalMemberId: input.personalMemberId } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function accruedRowNote(type: AssetTransaction['type'], assetLabel: string): string {
  return `${ACCRUED_LABELS[type === 'buy' ? 'buy' : 'sell']} — ${assetLabel}`;
}
```

### 4.2 Types and validation

- `types/assetTransactions.ts`: `AssetTransaction` gains `accruedInterestEur?: number` («a bond's accrued interest
  settled with the trade, EUR (> 0): paid on a buy, received on a sell; never in the PMC»);
  `AssetTransactionFormData` gains `accruedInterestEur?: number | null` (`null` on an edit = remove it, DATI-06's
  convention for a cleared field).
- `types/dividend.ts`: `DividendType` gains `'accrued'`; `Dividend` gains `sourceTradeId?: string`.
- `types/expenses.ts` (beside `feeOfTradeId`, `:147`): `accruedOfTradeId?: string`.
- `lib/constants/dividendTypes.ts` (`:26-32`): `accrued: 'Rateo'`. Adding the key touches three exhaustive
  readers: `components/dividends/DividendDialog.tsx` builds its select from that map, so it filters the type out
  (`Object.entries(dividendTypeLabels).filter(([value]) => value !== ACCRUED_DIVIDEND_TYPE)`);
  `LARGEST_TYPE_PREFIX` (`lib/utils/dividendiNarrative.ts`) gains `accrued: 'il rateo '`; `summarizeDividendStats`
  (`lib/utils/dividendAnalytics.ts`) initialises `byType.accrued: emptyTotals()`. The type is NOT added to
  `dividendDataSchema`'s enum (`lib/server/validation.ts:57-64`): the dividend API cannot create one.
- `lib/server/validation.ts` (`:89-103`): on the create schema `accruedInterestEur:
  z.number().finite().positive().optional()`; on the update schema the same `.nullable()`; the cross-field refine
  refuses a value on an `adjustment`.
- The three mappers of a trade read the field as they read `withheldTaxEur`: `docToAssetTransaction`
  (`lib/services/assetTransactionService.ts`, the client's read: the edit form and «Movimenti»),
  `getAssetTransactionsAdmin` and DATI-04's `getAssetTransactionsForAssetAdmin`
  (`lib/server/assetAdminRepository.ts`).

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
- **The trade's document.** `prepareCreate` stores `data.accruedInterestEur` when it is above zero on a buy or a
  sell, else nothing. `prepareUpdate`'s merge, beside `mergedWithheldTax` (`:352-362`):

```ts
// null = the form cleared it; undefined = this update does not speak of it.
const mergedAccrued =
  mergedType === 'adjustment' || updates.accruedInterestEur === null
    ? undefined
    : updates.accruedInterestEur ?? oldTrade.accruedInterestEur;
```

  The three document builders (`:115-117`, `:137-139`, `:161-163`) carry it as they carry `withheldTaxEur`
  (`FieldValue.delete()` on an update that leaves it undefined); the «needs a new settlement» test (`:230-231`)
  counts a change of it. `assertBaselineEditableFields` (`:225`) refuses `accruedInterestEur` too: a baseline is
  the opening position, not a purchase with a statement.
- **Nothing is decided in prepare** (adopted (h)). In `commitTradeMutation`, with `wantsAccrued =
  accruedInterestOf(plan.newTransaction) > 0` and `hadAccrued = accruedInterestOf(stored) > 0`:
  - r4 reads the settings document when `wantsFee || wantsAccrued` (it is ONE document,
    `assetAllocationTargets/{ownerId}`, and holds `dividendIncomeCategoryId` beside `transferFeeCategoryId`);
  - r5b reads `expenseCategories/{dividendIncomeCategoryId}` when `wantsAccrued` and the settings name one;
  - r7 reads the Cashflow row `expenses/accrued_{tradeId}` when `hadAccrued`.
  - Among the checks above the replay, after the asset's type: with `wantsAccrued`, an asset that is not a `bond`
    or whose currency is not EUR → `TradeUseCaseError(422, 'Il rateo riguarda solo le obbligazioni in euro.')`.
  - `accruedCategory` = the `DividendIncomeCategory` built from the two snapshots as
    `resolveDividendIncomeCategory` builds it (`lib/server/dividendUseCase.ts:28` — the mapping moves to an
    exported pure `dividendIncomeCategoryFrom(settings, categoryId, category)` there, which both call), null
    when the settings name none or the category document is gone or is not the owner's.
- Commit, a fifth write after the fee row (`:618-632`):

```ts
// w5: the accrued-interest rows, with their trade or not at all. They move no account: the settlement did.
const accruedId = accruedRowId(plan.tradeRef.id);
const accruedDividendRef = adminDb.collection('dividends').doc(accruedId);
const accruedExpenseRef = expenses.doc(accruedId);
const accruedRowExists = !!storedAccruedSnap?.exists;
if (!wantsAccrued) {
  // A trade that never had one has no row: nothing to delete, nothing written.
  if (hadAccrued) {
    tx.delete(accruedDividendRef);
    if (accruedRowExists) tx.delete(accruedExpenseRef);
  }
} else {
  const assetData = assetSnap.data();
  const label = (assetData?.ticker as string | undefined) || (assetData?.name as string | undefined) || '';
  // A row that exists follows its trade even with the category unset since, where it was written.
  const withExpense = accruedCategory !== null || accruedRowExists;
  tx.set(accruedDividendRef, buildAccruedDividendDoc({
    userId: plan.ownerId, trade: tradeToWrite!, now: new Date(),
    asset: { ticker: (assetData?.ticker as string) ?? '', name: (assetData?.name as string) ?? '', isin: assetData?.isin as string | undefined },
    expenseId: withExpense ? accruedId : undefined,
  }));
  if (accruedCategory !== null) {
    const cashData = cashReads.find(({ ref }) => ref.id === tradeToWrite!.linkedCashAssetId)?.snap.data();
    tx.set(accruedExpenseRef, buildAccruedExpenseDoc({
      userId: plan.ownerId, trade: tradeToWrite!, assetLabel: label, category: accruedCategory, now: new Date(),
      personalMemberId: tradeFeeOwner(assetData as Pick<Asset, 'ownerMemberId' | 'ownerShares'> | undefined, cashData as Pick<Asset, 'ownerMemberId' | 'ownerShares'> | undefined),
    }));
  } else if (accruedRowExists) {
    tx.update(accruedExpenseRef, { amount: signedAccrued(tradeToWrite!), date: tradeToWrite!.date, notes: accruedRowNote(tradeToWrite!.type, label), updatedAt: new Date() });
  }
}
```

  `storedAccruedSnap` is r7's. The response is unchanged (no field for the rateo): the rows are read by Dividendi
  and Cashflow, and `invalidateTradeCaches` already invalidates the expenses and, since DATI-04, the Dividendi tab's
  request and Rendimenti's receipts.
- **The bulk delete** (`deleteAllAssetTransactionsForAsset`, the instrument changes type — decision 86): for each
  deleted trade whose document has `accruedInterestEur > 0` it reads the two `accrued_{tradeId}` documents beside
  the fee rows and, for the ones that exist, removes the link — `tx.update(expenseRef, { accruedOfTradeId:
  FieldValue.delete(), updatedAt })` and `tx.update(dividendRef, { sourceTradeId: FieldValue.delete(), updatedAt
  })`. The rows stay as plain rows: the Cashflow one can be edited and deleted in Cashflow, the Dividendi one in
  Dividendi (its Cashflow row names no account, so deleting it moves none). The function's comment on the 500
  writes becomes «at most three writes per trade».

### 4.4 The readers that must not take it for a coupon

- `lib/server/dividendProcessor.ts`, `runExpenseCreation` (`:200-`): a dividend with `dividendType === 'accrued'` is
  skipped (its Cashflow row was written with its trade, or there is none by design).
- `lib/services/dividendIncomeService.ts`, `syncDividendExpenses` («Sincronizza» in Impostazioni › Dividendi, which
  creates a row for every dividend without `expenseId`): it skips an `'accrued'` dividend too — or a rateo written
  with no category would get a second row with a random id, and on the trade's day a second debit of the account.
- `lib/utils/dividendEntitlement.ts` (C8), `reconcileAnnouncedDividend`: its first line becomes `if
  (dividend.dividendType === 'accrued') return { kind: 'keep' };` (the literal, typed by `DividendType`: the two
  pure modules do not import each other in a circle). Without it the rateo of a first purchase written with no
  category (`isAutoGenerated`, no `expenseId`, held before = 0) is deleted after every trade.
- `app/api/dividends/stats/route.ts:343`: the dividend-growth filter excludes `'accrued'` with `'coupon'` and
  `'finalPremium'`.
- `lib/utils/dividendAnalytics.ts`, `computeReliability`: an `'accrued'` row is left out of `scoped` — a month
  whose only row is a rateo paid is not a month that paid, and a negative net is no payer's share.
- `app/api/dividends/[dividendId]/route.ts`, PUT and DELETE: a document with `dividendType === 'accrued'` AND a
  `sourceTradeId` answers 409 «Segue la sua operazione: si modifica da Patrimonio › Movimenti». An unlinked one
  (decision 86) is a row like any other.
- **Cashflow.** `lib/utils/tradeFeeExpense.ts` gains, beside `isTradeFeeRow` (`:66`):

```ts
/** A row its trade owns — the fee, the accrued interest: it is deleted with its trade, in Patrimonio. */
export function isTradeOwnedRow(row: Pick<Expense, 'feeOfTradeId' | 'accruedOfTradeId'>): boolean {
  return !!row.feeOfTradeId || !!row.accruedOfTradeId;
}
```

  In `components/cashflow/TransactionFeed.tsx` (`:262-287`) and `components/expenses/ExpenseTable.tsx`
  (`:266-279`): «Elimina» is disabled for `isTradeOwnedRow(expense)` with the existing title
  `TRADE_FEE_ROW_DELETE_BLOCKED` («Si elimina con la sua operazione, in Patrimonio»); «Modifica» is disabled for
  `isAccruedRow(expense)` with the title `ACCRUED_ROW_LOCKED` — new in `lib/utils/dialogNarrative.ts`: «Rateo di
  un'operazione del registro: importo e data li tiene l'operazione, in Patrimonio.» — and the row's reading in
  the feed says the same in place of `TRADE_FEE_ROW_NOTE`. A rateo row NEVER opens `ExpenseDialog`: its edit mode
  for a fee row (`:1538`, which stays on `isTradeFeeRow`) saves `-Math.abs(amount)` for a non-income and
  `+Math.abs(amount)` for an income, and would turn a rateo paid into one received. `performanceService.ts:726`
  and `:797` keep `isTradeFeeRow`: the rateo row is NOT skipped there, it is an income of the dividend category
  and falls in `dividendIncome` by the branch at `:738-742`, negative when paid. `isFeeRow`
  (`lib/utils/expenseFee.ts:54`) is unchanged: a rateo is not a fee.
- **Dividendi.** Wherever a record offers «Modifica» / «Elimina» — `components/dividends/DividendTable.tsx` (the
  desktop row and the mobile card), `DividendRecordDetailsDialog.tsx`, the calendar's `DividendDetailsDialog.tsx`
  — a row with `sourceTradeId` shows in their place the line «Segue la sua operazione: si modifica da Patrimonio ›
  Movimenti». Its type reads `ACCRUED_LABELS[netAmount < 0 ? 'buy' : 'sell']` («Rateo pagato» / «Rateo
  incassato»); `dividendTypeLabels.accrued` («Rateo») stays for the filters, the groups and the narrative. It is
  always «incassato» (its date is its trade's).
- «Movimenti» (`components/assets/AssetMovementsDialog.tsx`, both layouts): a trade's details show «Rateo pagato
  {eur}» / «Rateo incassato {eur}».
- **The Assistente** (DATI-15). `listTrades` (`lib/utils/assistantPortfolioQueries.ts`) adds to a `TradeLine`
  `accruedEur: number | null` (`signedAccrued(trade)`, null when there is none), and the description of
  `operazioni_registro` gains «…e, per un'obbligazione, il rateo di cedola pagato o incassato»; the description
  of `dividendi_cedole` gains «Il rateo pagato comprando un'obbligazione è una riga negativa di tipo Rateo.» —
  the tool needs no other change: an `accrued` row is a received row of the kind «Rateo». The portfolio block
  (`lib/utils/assistantPortfolioContext.ts`, the dividends' `kind`) prints the same label.

### 4.5 The form — `components/assets/TransactionDialog.tsx`

The ONE purchase form (decision 60): a bond's first purchase passes here too. For `asset.type === 'bond'` in EUR
and a buy or a sell that is not a baseline, a field under the fee: label `ACCRUED_LABELS[type]` + « (€)»,
optional, `z.number().min(0).optional().or(z.nan())` (`accruedInterestEur`, the schema at `:100-125`).

- On create, `proposeAccruedInterest(asset, quantity, dateIso)` is recomputed when quantity or date change and
  fills the field WHILE the user has not typed in it (a `touched` flag, the pattern of «Tasse trattenute»); under
  the field `describeAccruedProposal(...)`; with no proposal the field is empty and the line reads «Scrivi il rateo
  dell'estratto, se c'è.»
- On edit the stored value is shown and nothing is proposed. Changing the type (buy ↔ sell) empties the field.
- With a value above zero and `describeAccruedPastMonth(dateIso, todayIso)` not null, its sentence stands under
  the field, in `text-muted-foreground`, on create and on edit (decision 87).
- The total preview of the dialog adds the rateo to the debit (buy) or to the credit (sell).
- The payload sends `accruedInterestEur` when > 0; on an edit that empties a stored one it sends `null`; else the
  key is absent.

## 5. Constraints and traps

- **The PMC stands on price × quantity alone** (`tradeFeeExpense.ts:5-7`; doc/guide/registro-operazioni.md): the
  rateo never enters `replayTransactions`, the fiscal cost or the realised result.
- **A row its trade owns moves NO account** (`tradeFeeExpense.ts:12-13`): `computeCashDelta` already settled it; the
  Cashflow row has no `linkedCashAssetId`.
- **Every write decides inside its own transaction, and all reads come before the writes**
  (`assetTransactionUseCase.ts:48-52`; doc/guide/registro-operazioni.md § Concurrency): the category, the bond's
  type and currency and the stored Cashflow row are read in the transaction; prepare keeps reading the currency
  alone.
- **C8 is used as the index § 7 states it**: `settlementDayIso` is DATI-04's (no second T+2 in the app);
  `AnnouncedDividend` already carries `dividendType`.
- **A bond's dates are Timestamps in the browser** (`assetService.ts` converts four fields, none of
  `bondDetails`): `toDate` before any date arithmetic, as `patrimonioSummary.ts` and `couponUtils.ts` do.
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
| U3 | unit · `__tests__/accruedInterest.test.ts` | semi-annual 4% on 10.000, last coupon 1 March, trade on a Tuesday → value date Thursday; days and period counted; the gross × (1 − 12,5%) to the cent; the same with `issueDate` and `maturityDate` as `{ toDate: () => Date }` objects | trade date in place of the value date; drop `toDate` |
| U4 | unit · same | a trade on a Friday settles on Tuesday; the day before a coupon date settles after it → the days restart from that coupon; a value date ON the coupon date → no proposal | weekends counted |
| U5 | unit · same | no proposal for: a share, a bond in USD, an inflation-linked bond, a single coupon at maturity, a zero-coupon bond, quantity 0, a day after the maturity; a bond with no tax rate → net of 26% | propose for a BTP Italia |
| U6 | unit · same | a step-up bond uses the tier of the period's coupon date; the two documents: a buy → negative amounts, type `accrued`/`income`, the ids, no account on the Cashflow row, the member when given; a sell → positive | positive on a buy |
| U7 | unit · `__tests__/tradeFeeExpense.test.ts`, `__tests__/performanceService.test.ts` | `isTradeOwnedRow` is true for a fee row and a rateo row, `isTradeFeeRow` false for a rateo row, `isAccruedRow` false for a fee row; in Rendimenti a rateo row of −60 in the dividend category lowers `dividendIncome` by 60 and leaves the net cash flow alone | rateo row skipped as a fee row |
| U8 | unit · `__tests__/accruedInterest.test.ts` | `describeAccruedPastMonth('2026-09-30', '2026-11-23')` names «settembre 2026»; the same month and a later one → null | compare the days, not the months |
| U9 | unit · `__tests__/dividendAnalytics.test.ts` | `computeReliability`: a month whose only row is a rateo paid is not a paid month, and the rateo is no payer's share; `summarizeDividendStats` sums it under `byType.accrued` | count every row |
| V1 | unit · `__tests__/serverValidation.test.ts` | the create schema accepts `accruedInterestEur: 60` on a buy, refuses 0, a negative and one on an adjustment; the update schema accepts `null`; the dividend schema refuses `dividendType: 'accrued'` | open enum |
| T1 | unit · `__tests__/assetTransactionWriteTx.test.ts` | create with a rateo debits the account by it; an edit from 60 to 45 moves the account by 15; `null` on an edit removes the field and gives the 60 back; an update that does not name it keeps it; a delete restores the account; a rateo on a share or on a bond in USD → 422 from the commit; a rateo on a baseline → 400 | no reversal; `null` read as «keep» |
| T2 | unit · same | create writes the Dividendi row at `accrued_{tradeId}` (negative, type `accrued`, `sourceTradeId`); an edit rewrites it; clearing the rateo or deleting the trade deletes it | row left behind |
| T3 | unit · same | a trade with no rateo, stored or new, reads no dividend category and no `accrued_` document, and writes or deletes neither row | category always read |
| T4 | unit · same | with the dividend category set the Cashflow row exists (income, negative, no account, `accruedOfTradeId`, the member of `tradeFeeOwner`) and the Dividendi row names it; with none set there is no Cashflow row and no `expenseId`; a row written with a category, the category then unset, the trade edited → the row is updated in its category, not deleted | account on the row; delete the row when no category |
| T5 | unit · `__tests__/dividendProcessor.test.ts` | fixture: settings with an existing dividend category, an `accrued` dividend with no `expenseId` and a `paymentDate` in today's window → no row created, `createExpenseFromDividend` not called | drop the skip |
| T6 | unit · `__tests__/dividendEntitlement.test.ts` | the rateo of a first purchase, auto-generated and with no `expenseId`, reconciles to `keep` | drop the guard (→ `delete`) |
| T7 | unit · `__tests__/dividendIncomeService.test.ts` | `syncDividendExpenses` creates no row for an `accrued` dividend without `expenseId` | drop the skip |
| T8 | unit · `__tests__/dividendStatsRoute.test.ts` | an `accrued` row is not among the dividends the growth figure reads; PUT and DELETE of `/api/dividends/[id]` on a linked `accrued` row → 409, on an unlinked one → as any row (in the route's own test file) | drop the filter; guard on the type alone |
| T9 | unit · `__tests__/assetTransactionWriteTx.test.ts` | the bulk delete of a bond's trades leaves the two rows of a trade with a rateo, without `accruedOfTradeId` and `sourceTradeId`; a trade without one costs no extra read | delete the rows |
| Q1 | unit · `__tests__/assistantPortfolioQueries.test.ts` | a bond purchase with a rateo of 60 lists `accruedEur: -60`; a trade without one `null` | unsigned |
| D1 | dom · `__tests__/transactionDialogAccrued.test.tsx` (new; the harness of `__tests__/transactionDialog.fx.test.tsx`) | the field shows for a bond in EUR on buy and sell with the right label; not for a share, not for an adjustment, not on a baseline | field on every type |
| D2 | dom · same | the proposal fills the field and prints its line; typing keeps the typed value when the date changes; on edit nothing is proposed; a date in a past month prints the sentence of decision 87; emptying a stored value sends `null`; switching buy → sell empties the field | overwrite the typed value; send 0 |
| D3 | dom · `__tests__/accruedRowLocks.test.tsx` (new) | a rateo row in Cashflow has «Modifica» and «Elimina» disabled, each with its title; in Dividendi it reads «Rateo pagato», signed, with the line in place of edit and delete; an unlinked row has both back; «Movimenti» shows «Rateo pagato 60,00 €» | edit allowed; «Rateo» for the label |
| E1 | e2e · `e2e/assets.accrued-interest.spec.ts` (new) | the spec plants its own bond «BTP Alfa 4%» (EUR, an invented ISIN, 4% semi-annual, round issue and maturity dates, nominal 1), an account and the dividend category in the settings — the settings document read first and restored in `afterAll`, everything removed at the end, as `e2e/assets.trade-fee.spec.ts` does. Buy it with a rateo: the account drops by price + rateo, Dividendi shows «Rateo pagato» negative on the trade's date, Cashflow an income row with no «Modifica»; delete the trade → the three effects are gone | `computeCashDelta` without the rateo |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: buying a planted «BTP Alfa 4%» with a proposed rateo debits the account by price
+ fee + rateo; Dividendi shows «Rateo pagato» with a negative amount on the trade's date and the next coupon
whole; the price of carry is the clean price; deleting the trade removes every trace.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390 (the bond, the account and
  the category planted by the script and removed at its end): B the purchase with the proposal accepted; C the
  proposal overwritten, then the trade edited (the account and the rows follow), then a rateo typed on a purchase
  of two months ago (the warning, the rows in that month); D a sale with «Rateo incassato»; a bond with no
  proposal (inflation-linked): the field empty with its line; E the dividend category unset (no Cashflow row, the
  Dividendi row there) and then set and «Sincronizza» pressed (no second row), the delete of the trade, the bond
  turned into another type (the rows stay, unlocked), the shared account. Decoys: «ornitorinco» (a share: no
  field) and «fenicottero» (a rateo row in Cashflow: «Elimina» disabled).
- F — at the owner's «pronto», on the mirror: one bond purchase checked against his broker's statement (the debit
  to the cent, the proposed rateo against the statement's).

## 8. Putting it into service

No rules, no index: the two rows are written by the Admin SDK in collections that exist; the client reads them as
any dividend and any expense. No migration: a trade saved before has no rateo (adopted (f)). The owner may edit
his past bond purchases and type their rateo: each edit moves the account by it TODAY and writes the rows in the
trade's month (decision 87) — say so in the release note. Measure: `npm run perf:budget` on `/dashboard/assets`
and `/dashboard/allocation` (the form is in both first loads), inside their ceilings; a ceiling is raised by no
more than 1 KB gz and only with the register row (index § 8 rule 7). With phase F closed and the commit in
`develop`, the owner opens the PR `develop` → `main` (index § 8 rule 13).

## 9. Documentation

- `doc/guide/registro-operazioni.md` — § «Accrued interest» (the field, the settlement, why it is not in the PMC,
  the two rows and their ids, what the transaction reads for them, the bulk delete that unlinks them, the
  proposal's rule and its limits); § Per-page blind spots: bonds in euro only; no proposal for inflation-linked,
  single-coupon and zero-coupon bonds; holidays are not in the value date; a coupon calendar that drifts at a
  month's end (`addMonths`) drifts in the proposal too; the row's gross equals its net; the vitals of «Movimenti»
  stay on the price alone while Dividendi's total return sees the rateo; with no dividend category the Cashflow
  has no row and the Driver reads the rateo among the other changes; a rateo typed on an old trade moves the
  account today and the rows into the trade's month; a category changed in Impostazioni leaves the old rows
  where they were until their trade is saved again.
- `doc/guide/cashflow-dividendi.md` — the type «Rateo»: always received, signed, changed only through its trade,
  left out of the growth figure and of the reliability; § Per-page blind spots: the rateo is stored net (gross =
  net, tax 0); a month whose only row is a rateo paid shows a negative income.
- `doc/guide/cashflow.md` — a row its trade owns: the fee and the rateo (`isTradeOwnedRow`, `isAccruedRow`).
  `doc/guide/cashflow-analisi.md` § Per-page blind spots — a month whose dividend category is negative shows
  «Entrate» without its ring (The Ring Rule: a ring wants parts of a whole).
- `doc/guide/rendimenti.md` — the rateo's Cashflow row is dividend income, negative when paid: a return of the
  portfolio, never a contribution.
- `doc/guide/assistente.md` — `operazioni_registro` names the rateo. `doc/guide/assistente-registra.md` § Per-page
  blind spots — the card of a bond carries no rateo: the form it opens has the field.
- `doc/guide/impostazioni.md` — «Sincronizza» skips the rateo. `doc/guide/velocita.md` § Registro — only if a
  ceiling was raised.
- `README.md` — the trade ledger's feature lines. `AGENTS.md` § 3 — the stubs of the guides touched rewritten at
  equal or shorter length (decision 47).
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Obbligazioni — il
  rateo di cedola** — The accrued interest paid at a purchase and received at a sale is settled with the trade,
  proposed by the app and recorded as a row of its own in Dividendi; typed on an old purchase it moves the
  account today and writes the row in that purchase's month.»
- `CLAUDE.md` — the Registro operazioni line rewritten at equal or shorter length with «a bond's accrued interest
  settled with the trade, a row of its own in Dividendi»; the «Latest» entry REPLACED whole (decision 46: the
  date, this spec in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-19»); under 20.000 characters,
  counted with `node`.
- `doc/dati/README.md` § 6 (the row of 18 to `implemented`) and § 7 (C8: the guard; C3: `TradeLine.accruedEur`).

## 10. Declared out of scope

- A bond in another currency → doc/guide/registro-operazioni.md § Per-page blind spots.
- The proposal for an inflation-linked bond (BTP Italia, BTP€i), a single-coupon and a zero-coupon bond → the
  same section (the field takes the statement's figure).
- The rateo's gross and tax as separate figures → doc/guide/cashflow-dividendi.md § Per-page blind spots.
- The rateo in the card of a bond told to the Assistente → doc/guide/assistente-registra.md § Per-page blind
  spots (DATI-16 opens the form, which has the field).
- A market calendar for the value date → doc/guide/registro-operazioni.md § Per-page blind spots.

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
  condivisi — qui C8 e C3 —, regole della serie)
- Leggi doc/guide/registro-operazioni.md, doc/guide/cashflow-dividendi.md, doc/guide/cashflow.md,
  doc/guide/rendimenti.md, doc/guide/server.md, doc/guide/dialog.md, doc/guide/velocita.md,
  doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: la regola pura con U3–U6 e U8, i tipi, la
validazione e i tre mapper (V1), i tre lettori esaustivi del tipo (DividendDialog, dividendiNarrative,
dividendAnalytics), il regolamento e il replay (U1, U2), le letture e le due righe dentro la
transazione dell'operazione (T1–T4), l'eliminazione in blocco (T9), i lettori che non devono
scambiarla per una cedola né per una commissione (T5–T8, U7, U9), lo strumento dell'Assistente (Q1), il
modulo dell'operazione (D1, D2), Cashflow, Dividendi e Movimenti (D3), poi E1, perf:budget, i documenti
del § 9 e la riga 18 di doc/dati/README.md § 6 a `implemented`. OGNI test del § 6 va visto rosso con la
sua mutazione. Il codice dei §§ 4.1 e 4.3 è già scritto: copialo.

Fermati e chiedimi se: DATI-04, DATI-06 o DATI-15 non sono in develop con i contratti dell'indice
(settlementDayIso, AnnouncedDividend con dividendType, il modulo unico, listTrades — nomi o firme
diversi), il prezzo di carico o il risultato realizzato cambiano per una operazione con rateo, la
transazione dell'operazione dovrebbe leggere un documento oltre quelli del § 4.3, oppure un tetto di
perf:budget si alzerebbe di più di 1 KB gz.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec on the trade ledger's money path: the settlement changes and two
documents are written inside the trade's transaction. Estimated size: L (one pure module, the ledger's settlement
and commit, the form, the readers, 24 tests).
