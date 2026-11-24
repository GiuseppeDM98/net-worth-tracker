# DATI-04 — A dividend is worth what was held at the ex-date; a sold-out instrument is not scraped

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing. Written on 2026-11-23; every `file:line`
> is cited @ b0bf8276 (a line number is a hint, the function's name is the anchor). Owner's points 7.1 and 7.2;
> decisions 30, 51, 52, 55 and 56. Defines the shared contract **C8** (index § 7), extended by DATI-07, DATI-18 and
> DATI-21.

## 1. The problem today (evidence on the code)

- **The scrape books a dividend on today's quantity, whatever it is.** The daily cron
  (`lib/server/dividendProcessor.ts:93`, `runDividendScraping`) takes every equity asset with an ISIN (`:105-117`) —
  no test of the quantity — and for each scraped dividend writes `grossAmount = scrapedDiv.dividendPerShare *
  asset.quantity` (`:144`) with `quantity: asset.quantity` (`:153`). The button's route does the same
  (`app/api/dividends/scrape/route.ts:161`, comment «assume user holds current quantity»). For an instrument sold out
  (quantity 0) the cron still calls Borsa Italiana every evening and files dividends of 0,00 €; for one bought or
  sold in part after an ex-date, the record carries a quantity that was not held that day.
- **A trade never touches a dividend.** `lib/server/assetTransactionUseCase.ts` (create `:673`, update `:683`,
  delete `:695`, the commit `:494`) writes the trade, the asset's derived fields, the cash account and the fee row;
  `grep -n dividend` on it and on `app/api/asset-transactions` finds nothing. So a dividend announced on 100 shares
  stays at 100 after the owner sells them all before the ex-date, and on the payment day `runExpenseCreation`
  (`dividendProcessor.ts:200`, the loop from `:269`) turns it into an income row: money that never arrived, in
  Cashflow and on the account the dividend settles on. The owner's point 7.2 asked to verify it first: verified on
  the code, the gap is real.
- **The ledger already knows the quantity of any day**: `replayTransactions` (`lib/utils/assetTransactionUtils.ts:319`)
  over the trades up to that day, ordered by `sortTransactionsForReplay` (`:104`); the trades are read server-side by
  `getAssetTransactionsAdmin` (`lib/server/assetAdminRepository.ts:71`).

## 2. Goal and acceptance criteria

One rule, everywhere a dividend's quantity is decided: **an automatically created dividend or coupon that is still
to be paid is worth the quantity held at the end of the day before its ex-date** — for a share the trades count on
their own day, for a bond's coupon on their value date, two working days later (decision 51). The scrape applies it
when it creates; every trade re-applies it to the asset's pending records; the payment-day cron re-applies it before
it creates the income.

1. The cron does not call the scraper for an instrument with quantity 0 and no trade in its 60-day window. Proof: P1.
2. A scraped dividend is created on the quantity held the day before its ex-date when the ledger knows it, on today's
   quantity when it does not (no trades, or an ex-date before a migration baseline); a dividend whose quantity that
   day was 0 is not created. Both the cron and the button. Proof: U1–U3, P2, S1.
3. After a trade is created, edited or deleted, every auto-generated dividend and coupon of that asset that is
   still to be paid — no `expenseId` AND an Italian payment day of today or later (decision 52) — and whose entitled
   quantity changed is rewritten (quantity, gross, tax in the same proportion as before, net, and the euro fields of
   a foreign-currency record); at quantity 0 it is deleted, a record the old scrape wrote at quantity 0 included.
   Proof: U4–U6, U8, T1.
4. A dividend entered by hand, any dividend already cashed (`expenseId` set) and any whose payment day has passed
   is never touched by a trade. Proof: U5, U8.
5. The trade's answer says what happened (`announcedDividends: { updated, deleted }`) and the dialog toasts the
   sentence of § 4.5 when either count is above 0. Proof: U7, D1.
6. The reconciliation never fails a trade: if it throws, the trade stands, the answer carries zeros and the error is
   logged. Proof: T2.
7. On the payment day the cron applies the same verdict before creating the income: a record left at a stale
   quantity is corrected or deleted first. Proof: P3.
8. A sale AFTER the ex-date leaves the dividend whole (the seller is still owed it). Proof: U6.
9. A bond's coupon follows the value date: a purchase whose value date is on or after the coupon date earns no
   coupon, a sale whose value date is on or after it keeps it. Proof: U9.
10. A bond's next coupon is created on the quantity entitled at its date and not at 0, and the nightly walk goes
    past a date at 0 to the first future one; the two client schedulers (`scheduleNextCoupon`,
    `scheduleFinalPremium`) create nothing at quantity 0 (decision 56); a purchase that opens a bond's position from
    0 — the first one of a bond created empty, a buy-back — schedules its next coupon and its final premium at once.
    Proof: P4, C1, C2, D2.
11. A user whose ledger cannot be read is skipped by each phase of the cron for that evening and counted among the
    errors; nothing of theirs is created or cashed on a guessed quantity (decision 55). Proof: P5.
12. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green;
    `npm run perf:budget` green; `e2e/cashflow.dividendi.spec.ts` green untouched and
    `e2e/assets.announced-dividends.spec.ts` (E1) green.

## 3. Decisions

- **Decision 30** (owner, 2026-11-23): recompute on the quantity held at the ex-date at every purchase, sale or
  correction; at zero the record disappears; hand-entered records are not touched.
- **Decision 51** (owner, 2026-11-23): a bond's coupon and its accrued interest are decided on the same day, the
  value date (two working days after the trade): this spec defines `settlementDayIso`, DATI-18 reuses it.
- **Decision 52** (owner, 2026-11-23): a trade recomputes only the automatic records still to be paid — no
  `expenseId` and an Italian payment day of today or later. A share's dividend already paid has no `expenseId` when
  no income category is set, and the page shows it as received: it is history, never rewritten.
- **Decision 55** (owner, 2026-11-23): a failed read of the ledger in the cron skips that user for the phase and
  counts an error; the next evening tries again (the scrape's 60-day window and the coupons' catch-up absorb the
  day).
- **Decision 56** (owner, 2026-11-23): no coupon and no final premium is ever created at quantity 0, from any path.
- Adopted, reversible:
  - (a) «held at the ex-date» = the ledger's quantity at the end of the Italian day BEFORE the ex-date (a purchase on
    the ex-date itself buys the share without the dividend).
  - (b) the same rule for a bond's coupons and final premium, whose ex-date is the payment date in this app
    (`dividendProcessor.ts:447-449`), read on the trades' VALUE date (decision 51): a bond whose sale settles before
    the coupon date hands the coupon to the buyer. A migration baseline has no value date: it counts on its own day.
  - (c) the reconciliation runs AFTER the ledger's transaction, outside it, and is idempotent — a dividend is a
    forecast, not money, and the transaction's «all reads before writes» already holds five collections; the
    payment-day pass (criterion 7) is the net under a failed run.
  - (d) the tax keeps its proportion (26%, 12,5% or what the record carries), it is not recomputed from a rate.
  - (e) the button's route keeps scraping a sold-out instrument (the owner asked for it by pressing): each dividend
    is then created or skipped by the rule, and the answer counts the skipped ones (`notHeld`).

## 4. Solution

### 4.1 Pure module — `lib/utils/dividendEntitlement.ts` (new, written here)

```ts
/**
 * How many units a dividend is owed on: the quantity held at the end of the day before its ex-date.
 *
 * Until 2026-11-23 a scraped dividend took today's quantity and no trade ever touched it: one announced
 * on a hundred shares stayed at a hundred after they were sold before the ex-date, and the payment-day
 * cron turned it into an income that never arrived. The ledger knows the quantity of any day, so the
 * scrape, every trade and the payment day now ask it the same question.
 */
import type { AssetTransaction } from '@/types/assetTransactions';
import type { Dividend } from '@/types/dividend';
import { EPSILON, replayTransactions, sortTransactionsForReplay } from '@/lib/utils/assetTransactionUtils';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

export const SETTLEMENT_LAG_DAYS = 2;

const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
const fromDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** The value date: two working days after the trade's Italian day (Saturdays and Sundays skipped). */
export function settlementDayIso(tradeDayIso: string): string {
  let day = toDay(tradeDayIso);
  let left = SETTLEMENT_LAG_DAYS;
  while (left > 0) {
    day += 1;
    const weekday = new Date(day * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return fromDay(day);
}

/** Which day of a trade decides: a share goes ex on the trade day, a bond's coupon on the value date. */
export type EntitlementBasis = 'trade' | 'settlement';

export function entitlementBasisOf(dividendType: Dividend['dividendType'] | undefined): EntitlementBasis {
  return dividendType === 'coupon' || dividendType === 'finalPremium' ? 'settlement' : 'trade';
}

function entitlementDayIso(trade: AssetTransaction, basis: EntitlementBasis): string {
  const tradeDay = getItalyDateIso(trade.date);
  // A migration baseline states what was held from its day on: it has no value date.
  return basis === 'settlement' && !trade.isBaseline ? settlementDayIso(tradeDay) : tradeDay;
}

/**
 * The quantity of ONE asset held at the end of the Italian day before `exDate`, or null when the
 * ledger cannot say: no trades at all, or an ex-date that precedes a migration baseline (the opening
 * position says what was held from that day on, not before).
 */
export function quantityHeldBefore(trades: AssetTransaction[], exDate: Date, basis: EntitlementBasis = 'trade'): number | null {
  if (trades.length === 0) return null;
  const exDay = getItalyDateIso(exDate);
  const ordered = sortTransactionsForReplay(trades);
  const before = ordered.filter((trade) => entitlementDayIso(trade, basis) < exDay);
  if (before.length === 0) return ordered[0].isBaseline ? null : 0;
  return replayTransactions(before).quantity;
}

/** The quantity an automatic record is created on: the ledger's when it knows, else today's. */
export function entitledQuantity(
  assetQuantity: number,
  trades: AssetTransaction[],
  exDate: Date,
  basis: EntitlementBasis = 'trade',
): number {
  return quantityHeldBefore(trades, exDate, basis) ?? assetQuantity;
}

/** Whether an instrument can be owed anything in a scrape window that opens on `windowStart`. */
export function canBeOwedSince(assetQuantity: number, trades: AssetTransaction[], windowStart: Date): boolean {
  if (assetQuantity > 0) return true;
  const startDay = getItalyDateIso(windowStart);
  return trades.some((trade) => getItalyDateIso(trade.date) >= startDay);
}

export type EntitlementVerdict =
  | { kind: 'keep' }
  | { kind: 'delete' }
  | { kind: 'update'; quantity: number; grossAmount: number; taxAmount: number; netAmount: number };

export type AnnouncedDividend = Pick<
  Dividend,
  | 'isAutoGenerated' | 'expenseId' | 'dividendType' | 'exDate' | 'paymentDate'
  | 'quantity' | 'dividendPerShare' | 'grossAmount' | 'taxAmount'
>;

/**
 * What the ledger does to one pending record, as of the Italian day `asOfIso`. Never touched: a
 * hand-entered record, a cashed one, and one whose payment day is before `asOfIso` — the page
 * already shows it as received, and a share's dividend never gets an `expenseId` without an
 * income category (2026-11-23).
 */
export function reconcileAnnouncedDividend(
  dividend: AnnouncedDividend,
  trades: AssetTransaction[],
  asOfIso: string,
): EntitlementVerdict {
  if (!dividend.isAutoGenerated || dividend.expenseId) return { kind: 'keep' };
  if (getItalyDateIso(dividend.paymentDate) < asOfIso) return { kind: 'keep' };
  const held = quantityHeldBefore(trades, dividend.exDate, entitlementBasisOf(dividend.dividendType));
  if (held === null) return { kind: 'keep' };
  // Before the equality test: a record the old scrape wrote at quantity 0 must go, not stay.
  if (held < EPSILON) return { kind: 'delete' };
  if (Math.abs(held - dividend.quantity) < EPSILON) return { kind: 'keep' };
  // The record's own tax share (26%, 12,5% for a BTP, a rate typed by hand): kept, not recomputed.
  const taxShare = dividend.grossAmount > 0 ? dividend.taxAmount / dividend.grossAmount : 0;
  const grossAmount = dividend.dividendPerShare * held;
  const taxAmount = grossAmount * taxShare;
  return { kind: 'update', quantity: held, grossAmount, taxAmount, netAmount: grossAmount - taxAmount };
}

export interface AnnouncedDividendsOutcome {
  updated: number;
  deleted: number;
}

/** The toast after a trade that moved pending dividends, or null when it moved none. */
export function describeAnnouncedDividendsOutcome({ updated, deleted }: AnnouncedDividendsOutcome): string | null {
  if (updated === 0 && deleted === 0) return null;
  const recomputed = updated === 1 ? '1 dividendo annunciato ricalcolato' : `${updated} dividendi annunciati ricalcolati`;
  const removed = deleted === 1 ? '1 dividendo annunciato eliminato' : `${deleted} dividendi annunciati eliminati`;
  if (deleted === 0) return `${recomputed} sulla quantità posseduta allo stacco.`;
  if (updated === 0) return `${removed}: allo stacco lo strumento non era in portafoglio.`;
  return `${recomputed} e ${deleted === 1 ? '1 eliminato' : `${deleted} eliminati`}: conta la quantità posseduta allo stacco.`;
}
```

### 4.2 Server — `lib/server/dividendEntitlementService.ts` (new)

`reconcileAnnouncedDividendsForAsset(ownerId: string, assetId: string): Promise<AnnouncedDividendsOutcome>`: the
asset's trades through a new `getAssetTransactionsForAssetAdmin(userId, assetId)` in
`lib/server/assetAdminRepository.ts` — beside `getAssetTransactionsAdmin`, the same mapper on
`.where('userId', '==', userId).where('assetId', '==', assetId)` (equality only, no index: the query the commit's
first read already runs) —, `getDividendsByAsset(ownerId, assetId)` (`lib/services/dividendService.ts:52`), then for
each record the verdict with `asOfIso = getItalyDateIso()`: `delete` → `deleteDividend(id)`; `update` →
`updateDividend(id, { quantity, grossAmount, taxAmount, netAmount, currency: dividend.currency })` — the currency is
passed because `updateDividend` recomputes the euro fields only when it receives one (`dividendService.ts:316`).
Returns the two counts. No write when every verdict is `keep`.

### 4.3 The ledger's use case — `lib/server/assetTransactionUseCase.ts`

`TradeMutationResult` (`:80`) gains `announcedDividends: AnnouncedDividendsOutcome`. The three public functions
(`:673`, `:683`, `:695`) call, after `commitTradeMutation(plan)`, a private
`reconcileAnnouncedSafely(plan.ownerId, plan.assetId)` — a `try/catch` around § 4.2 that logs and returns
`{ updated: 0, deleted: 0 }` — and `buildResult` (`:659`) takes its value. `deleteAllAssetTransactionsForAsset`
(`:723`) is not touched (the asset is leaving the ledger).

The reconciliation is NOT serialized with the ledger's transaction: two trades on one asset committed within the
same second (two tabs, the owner and a co-owner) can leave the earlier verdict written last. The next trade on the
asset and the payment-day pass correct it; § 9 records it in the ledger's guide.

### 4.4 The scrape and the payment day

- **The ledger is read once per user per phase**, inside that user's `try`: `getAssetTransactionsAdmin(userId)`,
  grouped by `assetId`. A read that throws skips the user for the phase — nothing of theirs is scraped, cashed or
  scheduled that evening —, increments the phase's `errors` and logs `Error reading the ledger of user ${userId}:`
  (decision 55). An empty ledger is not a failure: the rule then falls back to today's quantity (criterion 2).
- `runDividendScraping` (`dividendProcessor.ts:93`): the trades grouped by `assetId`. Before `scrapeDividendsByIsin`
  (`:127`): `if (!canBeOwedSince(asset.quantity, tradesOf(asset.id),
  sixtyDaysAgo)) continue;`. Inside the loop, `const quantity = entitledQuantity(asset.quantity, tradesOf(asset.id),
  scrapedDiv.exDate); if (quantity <= 0) continue;` replaces `asset.quantity` at `:144` and `:153`.
- `app/api/dividends/scrape/route.ts`: the same `entitledQuantity` at `:161` and `:171`, the trades read once after
  the ownership check; a dividend with quantity 0 is counted in `notHeld` and not created; the answer (`:222-232`)
  gains `notHeld`. `components/dividends/DividendTrackingTab.tsx`, `executeScrapeAll`: the client scrapes one
  instrument at a time, so `scrapeOne` sums each answer's `notHeld` into a `notHeldCount` beside `successCount`;
  when `successCount === 0 && notHeldCount > 0` the warning «Nessun nuovo dividendo trovato» is replaced by «Nessun
  nuovo dividendo: 1 dividendo staccato quando non avevi lo strumento.» (one) or «Nessun nuovo dividendo: {n}
  dividendi staccati quando non avevi gli strumenti.» (more). With `successCount > 0` the success toast is unchanged.
- `runExpenseCreation` (`dividendProcessor.ts:200`): after the idempotency and eligibility tests (`:274-286`) and
  before the income is built, for an `isAutoGenerated` record: the verdict of § 4.1 on the asset's trades, with
  `asOfIso` = the Italian day of the record's own `paymentDate` (the pass is cashing it now, a recovered coupon
  included, so the «still to be paid» test of decision 52 never excludes it); `delete` → `deleteDividend`,
  `continue`; `update` → `updateDividend(id, { quantity, grossAmount, taxAmount, netAmount, currency })`, then
  `getDividendById(id)` (`dividendService.ts:117`) and the income is built from the record READ BACK — the local copy
  holds the old `netAmountEur`, which is what a foreign record's income reads.
- `runNextCouponScheduling` (`:367`): inside the `while (true)` walk, after the duplicate test, the quantity is
  `entitledQuantity(asset.quantity, tradesOf(coupon.assetId), nextDate, 'settlement')` and replaces `asset.quantity`
  in the gross and in the record. At quantity 0 the coupon is not created and the walk goes on as it does past a
  duplicate: `if (nextDate.getTime() > todayEndMs) break; fromDate = nextDate; continue;` — it steps over a past
  date at 0 and stops at the first future one, created or not. A bond sold before one coupon and bought back after
  it gets its next coupon the same evening; `skipped` is not incremented for a date at 0.
- `lib/services/couponScheduling.ts` (decision 56): `scheduleNextCoupon` returns `{ scheduled: false }` and
  `scheduleFinalPremium` returns `false` when `quantity <= 0`, before any request — saving the form of a bond sold
  out no longer recreates a coupon of 0,00 €.

### 4.5 Client

- `lib/services/assetTransactionService.ts` types the answer's new field; `components/assets/TransactionDialog.tsx`
  (and the two other callers of the three mutation hooks) toasts `describeAnnouncedDividendsOutcome(result.announcedDividends)`
  with `toast.info` when it is not null.
- `invalidateTradeCaches` (`lib/hooks/useAssetTransactions.ts:61-68`) also invalidates
  `queryKeys.dividendReceipts.all(ownerId)` (Rendimenti) and `dividendStatsQueryKey(ownerId)` from
  `lib/hooks/useDividendStats.ts` (the Dividendi tab's one request, list and stats), so «Annunciate» shows the new
  amount without a reload. The function's comment and the file's header say «six keys».
- **A position that opens from 0 gets its coupon at the purchase.** `lib/services/couponScheduling.ts` gains
  `scheduleCouponsForOpenedPosition({ asset, quantityBefore, quantityAfter, userId }): Promise<void>`: a no-op unless
  `asset.bondDetails && quantityBefore === 0 && quantityAfter > 0`, else `scheduleNextCoupon` and
  `scheduleFinalPremium` with `quantity: quantityAfter` and the asset's `bondDetails`, `currency`, `taxRate` — the two
  calls `AssetDialog` makes at a save. `TransactionDialog` calls it after a successful CREATE of a buy, with
  `quantityBefore: asset.quantity` and `quantityAfter: result.derived.quantity`; a rejection is logged and toasts
  «Operazione registrata, ma la cedola automatica non è stata programmata.», and never fails the trade. Why here: at
  quantity 0 no pending coupon exists (the reconciliation deleted it, or decision 56 never created it), so the call
  overwrites nothing; and the cron's walk reseeds a bond only from a coupon PAID in the last
  `COUPON_CATCHUP_LOOKBACK_DAYS` (370), which a bond that never cashed one does not have. The record is created on
  today's quantity: a purchase within two working days of the coupon date is corrected by the payment-day pass.

## 5. Constraints and traps

- **«A page reads a HOOK»; a mutation invalidates by `queryKeys`** (AGENTS.md § 2 Data and State Patterns): here it means the
  dividend keys are added to the ONE invalidation function, not sprinkled in the dialog.
- **Server route shape + `assertCanAccessAccount`**: no new route; the reconciliation runs inside the trade routes,
  which already authorize the account — it must use `plan.ownerId`, never a body field.
- **`runTransaction`: all reads before writes** (AGENTS.md:246): here it means the reconciliation is NOT added to
  `commitTradeMutation`; it follows it.
- **Italian day** (`getItalyDateIso`): a trade at 23:30 UTC on the eve of the ex-date is, in Italy, on the ex-date
  itself — U3 pins it. Run the suite under `TZ=UTC` too.
- **`updateDividend` skips the euro conversion without a currency** (`dividendService.ts:316`): pass it.
- **Invented figures in tests**: 100 shares, 0,50 € a share, 26% — never a real holding.
- **A series label never enters the code**; comments say «2026-11-23».
- **Three later specs extend this module, in this order, each adding and none rewriting**: DATI-07 adds
  `foreignTaxAmount` to `AnnouncedDividend` and to the `update` verdict; DATI-18 adds, as the function's first line,
  the guard that an `'accrued'` row is never a candidate; DATI-21 adds a fourth optional argument that caps a
  `'finalPremium'` record. `dividendType` and `paymentDate` are in the Pick from this spec on, so none of them
  widens it for those two.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/dividendEntitlement.test.ts` | buy 100 on 1 Mar, sell 40 on 10 Mar: held before 5 Mar = 100, before 10 Mar (a sale ON the ex-date) = 100, before 15 Mar = 60 | `<` → `<=` in the day filter (U3 too) |
| U2 | unit · same | no trades → null; a baseline dated after the ex-date → null; a first real BUY after the ex-date → 0 | drop the `isBaseline` branch |
| U3 | unit · same | a buy ON the ex-date (Italian day, an instant of 23:30 UTC the eve) does not count | `getItalyDateIso` → `toISOString().slice(0,10)` |
| U4 | unit · same | announced on 100 × 0,50 with 13,00 tax; sold 40 before → update: 60, 30,00, 7,80, 22,20; a second record at 12,5% (tax 6,25) → 60, 30,00, 3,75, 26,25 — compared with `toBeCloseTo` | `taxShare` → `0.26` (the 12,5% record goes red) |
| U5 | unit · same | `isAutoGenerated: false` → keep; `expenseId` set → keep | drop the first guard |
| U6 | unit · same | all sold before the ex-date → delete; all sold AFTER it → keep; a record written at quantity 0 with the ledger at 0 → delete | `held < EPSILON` → `held <= dividend.quantity` (the «sold after» case goes red); move the equality test back above the zero test (the quantity-0 record goes red) |
| U8 | unit · same | with `asOfIso` '2026-03-20': a record paid on 2026-03-19, no `expenseId`, all sold before its ex-date → keep; the same record paid on 2026-03-20 → delete | drop the payment-day guard |
| U9 | unit · same | `settlementDayIso('2026-03-05')` (a Thursday) = '2026-03-09'; a coupon of 2026-03-10: a buy on Thu 5 Mar (value 9 Mar) counts, a buy on Fri 6 Mar (value 10 Mar) does not; a `'coupon'` record follows it, an `'ordinary'` one with the same dates counts both buys; a baseline counts on its own day | `entitlementBasisOf` → always `'trade'` |
| U7 | unit · same | the four sentences of `describeAnnouncedDividendsOutcome` (0/0 null, 1/0, 0/2, 2/1) | swap the two singular forms |
| T1 | unit · `__tests__/assetTransactionWriteTx.test.ts` (new block) | `createAssetTransaction` of a sale → the pending record updated through `updateDividend` with its currency; a hand-entered one untouched; the result carries `{ updated: 1, deleted: 0 }` | remove the call after the commit |
| T2 | unit · same | the reconciliation throwing → the trade's result returned with zeros | remove the `try/catch` |
| P1 | unit · `__tests__/dividendProcessor.test.ts` | an asset at quantity 0 with its last trade 90 days ago → the scraper mock is never called | drop `canBeOwedSince` |
| P2 | unit · same | a scraped dividend with ex-date before a later purchase is created on the earlier quantity | `entitledQuantity` → `asset.quantity` |
| P3 | unit · same | payment day, record at 100, ledger says 0 → deleted, no income; ledger says 60 → income on 60, built from the record read back (`getDividendById` mocked with the new euro net) | skip the verdict in `runExpenseCreation` |
| P4 | unit · same | phase 3: the coupon after the paid one falls on a past date at quantity 0, the following one is future and owed → the first is not created, the second is; a future coupon at 0 → nothing created, the loop ends | `break` in place of the step-over |
| P5 | unit · same | `getAssetTransactionsAdmin` rejecting for one user of two → that user gets no scrape call, no income and no coupon, `errors` counts it, the other user is processed | fall back to `[]` on a rejection |
| C1 | unit · `__tests__/couponScheduling.test.ts` | `scheduleNextCoupon` and `scheduleFinalPremium` at quantity 0 make no request and answer `{ scheduled: false }` / `false` | drop the guard |
| S1 | unit · `__tests__/dividendScrapeRoute.test.ts` (new) | the button on a sold-out asset (bought 100, sold all on 10 Mar) with two scraped dividends, ex-dates 5 Mar and 20 Mar → one created on 100, `notHeld: 1` | route keeps `asset.quantity` |
| D1 | dom · `__tests__/transactionDialog.announced.test.tsx` | a result with `{ updated: 1, deleted: 0 }` → the toast's sentence; zeros → no toast | toast unconditionally |
| C2 | unit · `__tests__/couponScheduling.test.ts` | `scheduleCouponsForOpenedPosition`: a bond from 0 to 1.000 → one coupon request and one premium request on 1.000; from 500 to 1.500 → no request; a stock → no request | drop the `quantityBefore === 0` test |
| D2 | dom · `__tests__/transactionDialog.announced.test.tsx` | a buy saved on a bond at quantity 0 → `scheduleCouponsForOpenedPosition` called with the result's derived quantity; a sale → not called | call it for every type |
| E1 | e2e · `e2e/assets.announced-dividends.spec.ts` (new, desktop) | plants a EUR stock with a baseline of 10 and the ledger meta when absent (the pattern of `e2e/assets.bond.spec.ts`), an auto-generated EUR dividend with a future ex-date and payment day, and a hand-entered decoy; sells the 10 through «Registra operazione»; on the emulator the automatic record is gone and the decoy stays, and on Dividendi the row with «Attesa» under «Annunciate» is gone | remove the reconciliation call |

**The harnesses.** `__tests__/assetTransactionWriteTx.test.ts` is the ledger's (an in-memory Firestore and a mock of
`@/lib/server/assetAdminRepository`): the mock gains `getAssetTransactionsForAssetAdmin`, and a
`vi.mock('@/lib/services/dividendService', …)` gives `getDividendsByAsset`, `updateDividend`, `deleteDividend`; T2
makes `getDividendsByAsset` reject. `__tests__/dividendProcessor.test.ts` mocks `dateHelpers` whole and throws on a
collection its `adminDb` does not list: its `dateHelpers` mock becomes partial (`...(await importOriginal())`,
`isDateOnOrAfter` still mocked) and it mocks `@/lib/server/assetAdminRepository` with `getAssetTransactionsAdmin` →
`[]` by default (the trades are given per test in P1–P5); the existing tests stay green with no other change. E1
does not live in `e2e/cashflow.dividendi.spec.ts`: that spec runs on the base account with no dividend and asserts
the empty page; E1 cleans what it planted in a loop at its start and at its end.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: after selling the whole position of an instrument with an announced dividend, the
toast reads «1 dividendo annunciato eliminato: allo stacco lo strumento non era in portafoglio.», Dividendi ›
«Annunciate» no longer shows it, and no income row appears on its payment day.

- A — the diff. B–E automated by a throwaway Playwright script on the emulators (no control that spends; the
  scraper is never called — records are planted): B sell all → deleted; C sell half → amount halved, tax in
  proportion; D buy more before the ex-date → amount grown; a sale dated AFTER the ex-date → unchanged; a
  hand-entered decoy («ornitorinco»), a cashed one («fenicottero») and an automatic one paid yesterday («tapiro»)
  untouched; E edit the sale's date across the ex-date and delete the sale → the record follows each time; a bond's
  coupon with a purchase whose value date is the coupon date → the coupon does not count it.
- F — at the owner's «pronto», on the mirror: one sale and one purchase on an instrument with an announced dividend.

## 8. Putting it into service

No DDL, no rules change, no index (the dividends of an asset are already queried by `getDividendsByAsset`; the
asset's trades by two equalities). Order: merge into `develop`, then the owner's PR `develop` → `main` (index § 8
rule 13); the first production cron after that merge applies the new scrape rule. Existing stale records still to
be paid — the ones at quantity 0 included — are corrected by the payment-day pass as they fall due, or at the next
trade on their asset; nothing is migrated, and a record already paid is never rewritten (decision 52).

## 9. Documentation

- `doc/guide/cashflow-dividendi.md` — new rule «a pending record follows the ledger» (what is touched, what never
  is — hand-entered, cashed, already paid —, the three moments, the value date for a coupon), the scrape's skip,
  `notHeld`, the cron's skip of a user whose ledger does not read; its § blind spots: a record created before a
  migration baseline keeps today's quantity; an ADJUSTMENT (a split) before the ex-date changes the quantity while
  `dividendPerShare` stays as scraped; an instrument re-created on an ISIN that already paid shares the asset id,
  so its trades reach only the records still to be paid; a record whose income row the user deleted is pending
  again; no one-off pass rewrites the stale records on the day of the deploy.
- `doc/guide/registro-operazioni.md` — the trade's answer carries `announcedDividends`; the mutation hooks
  invalidate six keys (the sentence «Mutation hooks invalidate four keys» is rewritten); § Concurrency gains: «The
  announced-dividend reconciliation runs after the commit and is not serialized: two concurrent trades on one asset
  can leave the earlier verdict written last; the next trade on the asset and the payment-day pass correct it
  (2026-11-23)».
- `AGENTS.md` § 3 stub of Dividendi — rewritten at equal or shorter length with the rule and the date (decision 47:
  the detail lives in the guide).
- `README.md` § Dividends — one sentence: an announced dividend follows purchases and sales until its ex-date, and
  sold-out instruments are no longer searched.
- `Draft Release Temp.md` — one entry prepended in `## 🔧 Improvements`, in the file's form: «**Cashflow › Dividendi
  — un dividendo annunciato segue le operazioni** — Changed: an announced dividend follows your purchases and sales
  until its ex-date (removed when you no longer hold the instrument), a bond's coupon follows the value date, and
  sold-out instruments are no longer searched every evening.»
- `CLAUDE.md` — the Dividendi line is rewritten at equal or shorter length with «a pending record follows the
  ledger»; the «Latest» entry REPLACED whole (decision 46: the date, this spec in one sentence, «Open: doc/dati/
  (README § 6)», «Next: DATI-05»); under 20.000 characters, counted with `node` (doc/guide/collaudo.md § Where
  things are recorded).
- `doc/dati/README.md` § 6: status row.

## 10. Declared out of scope

- The two withholdings and the currency of a foreign dividend → DATI-07.
- Where a sold-out instrument is listed, and its deletion → DATI-05.
- A one-off pass that rewrites every stale pending record on the day of the deploy → not planned: the payment-day
  net and the next trade cover them; doc/guide/cashflow-dividendi.md § blind spots says so.
- Dividends of instruments outside the ledger's types → unchanged (today's quantity); recorded in
  doc/guide/cashflow-dividendi.md § blind spots.
- The units a final premium is owed on (bought at issue, never sold) → DATI-21; here the premium record follows the
  ledger's quantity like a coupon.
- A split's effect on `dividendPerShare`, a reused ISIN's older records → doc/guide/cashflow-dividendi.md § blind
  spots (§ 9).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-04-dividendi-quantita-allo-stacco.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, regole della serie)
- Leggi doc/guide/cashflow-dividendi.md, doc/guide/registro-operazioni.md, doc/guide/server.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI solo per un toast: leggi in DESIGN.md la parte sui toast
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

Implementa la spec così com'è scritta, nell'ordine: il modulo puro con U1–U9, il servizio server e
l'aggancio nel caso d'uso del registro (T1, T2, nell'harness di assetTransactionWriteTx), lo scrape del
cron e del pulsante, il giorno di pagamento e la fase 3 (P1–P5, S1; prima i due cambi dell'harness di
dividendProcessor.test.ts descritti nel § 6), le due guardie di couponScheduling e la cedola
all'apertura della posizione (C1, C2), il toast, l'invalidazione e la chiamata dal modulo (D1, D2), poi E1 sugli emulatori, i documenti del § 9 e la riga 04 di doc/dati/README.md § 6
a `implemented`. OGNI test del § 6 va visto rosso con la sua mutazione. Il codice del § 4.1 è già
scritto: copialo. Leggi anche doc/guide/e2e-emulatori.md prima di E1 (strumento, posizione iniziale e
meta del registro piantati).

Fermati e chiedimi se: il caso d'uso del registro non è più come lo descrive il § 1 (commit b0bf8276),
la riconciliazione dovrebbe entrare nella transazione per far passare un test, oppure un test
esistente dei dividendi diventa rosso DOPO i due cambi dell'harness del § 6 per una ragione che non è
la quantità.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an M spec that hooks the trade ledger and two crons (money written by a
server path). Estimated size: M (two new modules, eleven touched, 25 tests).
