# DATI-04 — A dividend is worth what was held at the ex-date; a sold-out instrument is not scraped

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing. Written on 2026-11-23; every `file:line`
> is cited @ b0bf8276. Owner's points 7.1 and 7.2; decision 30.

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

One rule, everywhere a dividend's quantity is decided: **an automatically created dividend or coupon that has not
been cashed is worth the quantity held at the end of the day before its ex-date**. The scrape applies it when it
creates; every trade re-applies it to the asset's pending records; the payment-day cron re-applies it before it
creates the income.

1. The cron does not call the scraper for an instrument with quantity 0 and no trade in its 60-day window. Proof: P1.
2. A scraped dividend is created on the quantity held the day before its ex-date when the ledger knows it, on today's
   quantity when it does not (no trades, or an ex-date before a migration baseline); a dividend whose quantity that
   day was 0 is not created. Both the cron and the button. Proof: U1–U3, P2, S1.
3. After a trade is created, edited or deleted, every auto-generated, un-cashed dividend and coupon of that asset
   whose entitled quantity changed is rewritten (quantity, gross, tax in the same proportion as before, net, and the
   euro fields of a foreign-currency record); at quantity 0 it is deleted. Proof: U4–U6, T1.
4. A dividend entered by hand, and any dividend already cashed (`expenseId` set), is never touched. Proof: U5.
5. The trade's answer says what happened (`announcedDividends: { updated, deleted }`) and the dialog toasts the
   sentence of § 4.5 when either count is above 0. Proof: U7, D1.
6. The reconciliation never fails a trade: if it throws, the trade stands, the answer carries zeros and the error is
   logged. Proof: T2.
7. On the payment day the cron applies the same verdict before creating the income: a record left at a stale
   quantity is corrected or deleted first. Proof: P3.
8. A sale AFTER the ex-date leaves the dividend whole (the seller is still owed it). Proof: U6.
9. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green;
   `e2e/cashflow.dividendi.spec.ts` green with E1 added.

## 3. Decisions

- **Decision 30** (owner, 2026-11-23): recompute on the quantity held at the ex-date at every purchase, sale or
  correction; at zero the record disappears; hand-entered records are not touched.
- Adopted, reversible:
  - (a) «held at the ex-date» = the ledger's quantity at the end of the Italian day BEFORE the ex-date (a purchase on
    the ex-date itself buys the share without the dividend).
  - (b) the same rule for a bond's coupons, whose ex-date is the payment date in this app
    (`dividendProcessor.ts:447-449`): a bond sold before the coupon date hands the coupon to the buyer.
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

/**
 * The quantity of ONE asset held at the end of the Italian day before `exDate`, or null when the
 * ledger cannot say: no trades at all, or an ex-date that precedes a migration baseline (the opening
 * position says what was held from that day on, not before).
 */
export function quantityHeldBefore(trades: AssetTransaction[], exDate: Date): number | null {
  if (trades.length === 0) return null;
  const exDay = getItalyDateIso(exDate);
  const ordered = sortTransactionsForReplay(trades);
  const before = ordered.filter((trade) => getItalyDateIso(trade.date) < exDay);
  if (before.length === 0) return ordered[0].isBaseline ? null : 0;
  return replayTransactions(before).quantity;
}

/** The quantity a scraped dividend is created on: the ledger's when it knows, else today's. */
export function entitledQuantity(assetQuantity: number, trades: AssetTransaction[], exDate: Date): number {
  return quantityHeldBefore(trades, exDate) ?? assetQuantity;
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
  'isAutoGenerated' | 'expenseId' | 'exDate' | 'quantity' | 'dividendPerShare' | 'grossAmount' | 'taxAmount'
>;

/** What a trade does to one pending record. A hand-entered or a cashed one is never touched. */
export function reconcileAnnouncedDividend(dividend: AnnouncedDividend, trades: AssetTransaction[]): EntitlementVerdict {
  if (!dividend.isAutoGenerated || dividend.expenseId) return { kind: 'keep' };
  const held = quantityHeldBefore(trades, dividend.exDate);
  if (held === null || Math.abs(held - dividend.quantity) < EPSILON) return { kind: 'keep' };
  if (held < EPSILON) return { kind: 'delete' };
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
  if (deleted === 0) return `${recomputed} sulla quantità che avrai allo stacco.`;
  if (updated === 0) return `${removed}: allo stacco non avrai più lo strumento.`;
  return `${recomputed} e ${deleted === 1 ? '1 eliminato' : `${deleted} eliminati`}: conta la quantità allo stacco.`;
}
```

### 4.2 Server — `lib/server/dividendEntitlementService.ts` (new)

`reconcileAnnouncedDividendsForAsset(ownerId: string, assetId: string): Promise<AnnouncedDividendsOutcome>`:
`getAssetTransactionsAdmin(ownerId)` filtered to the asset, `getDividendsByAsset(ownerId, assetId)`
(`lib/services/dividendService.ts:52`), then for each record the verdict: `delete` → `deleteDividend(id)`; `update` →
`updateDividend(id, { quantity, grossAmount, taxAmount, netAmount, currency: dividend.currency })` — the currency is
passed because `updateDividend` recomputes the euro fields only when it receives one (`dividendService.ts:316`).
Returns the two counts. No write when every verdict is `keep`.

### 4.3 The ledger's use case — `lib/server/assetTransactionUseCase.ts`

`TradeMutationResult` (`:80`) gains `announcedDividends: AnnouncedDividendsOutcome`. The three public functions
(`:673`, `:683`, `:695`) call, after `commitTradeMutation(plan)`, a private
`reconcileAnnouncedSafely(plan.ownerId, plan.assetId)` — a `try/catch` around § 4.2 that logs and returns
`{ updated: 0, deleted: 0 }` — and `buildResult` (`:659`) takes its value. `deleteAllAssetTransactionsForAsset`
(`:723`) is not touched (the asset is leaving the ledger).

### 4.4 The scrape and the payment day

- `runDividendScraping` (`dividendProcessor.ts:93`): one `getAssetTransactionsAdmin(userId)` per user, grouped by
  `assetId`. Before `scrapeDividendsByIsin` (`:127`): `if (!canBeOwedSince(asset.quantity, tradesOf(asset.id),
  sixtyDaysAgo)) continue;`. Inside the loop, `const quantity = entitledQuantity(asset.quantity, tradesOf(asset.id),
  scrapedDiv.exDate); if (quantity <= 0) continue;` replaces `asset.quantity` at `:144` and `:153`.
- `app/api/dividends/scrape/route.ts`: the same `entitledQuantity` at `:161` and `:171`, the trades read once after
  the ownership check; a dividend with quantity 0 is counted in `notHeld` and not created; the answer (`:222-232`)
  gains `notHeld`. `components/dividends/DividendTrackingTab.tsx` (the toast near `:476`): when `created === 0` and
  `notHeld > 0` the warning reads «Nessun nuovo dividendo: {notHeld} staccati quando non avevi lo strumento.»
- `runExpenseCreation` (`dividendProcessor.ts:200`): after the idempotency and eligibility tests (`:274-286`) and
  before the income is built, for an `isAutoGenerated` record: the verdict of § 4.1 on the asset's trades (read once
  per user, as above); `delete` → `deleteDividend`, `continue`; `update` → `updateDividend` and the income is built
  from the updated amounts.
- `runNextCouponScheduling` (`:367`): a new coupon is created on `entitledQuantity(asset.quantity, trades, nextDate)`
  (`:440`, `:447`), and not created at 0 — which also stops the chain of a bond sold out.

### 4.5 Client

- `lib/services/assetTransactionService.ts` types the answer's new field; `components/assets/TransactionDialog.tsx`
  (and the two other callers of the three mutation hooks) toasts `describeAnnouncedDividendsOutcome(result.announcedDividends)`
  with `toast.info` when it is not null.
- `invalidateTradeCaches` (`lib/hooks/useAssetTransactions.ts:61-68`) also invalidates the dividend keys the
  Dividendi tab and Rendimenti read (`queryKeys.dividendReceipts.all(ownerId)` and the dividend list/stats keys of
  `lib/query/queryKeys.ts`), so «Annunciati» shows the new amount without a reload.

## 5. Constraints and traps

- **«A page reads a HOOK»; a mutation invalidates by `queryKeys`** (AGENTS.md § Data & State): here it means the
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
- DATI-07 rewrites a foreign dividend's amounts (two withholdings): it keeps this module's verdict and extends
  `update` there — nothing here anticipates it.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/dividendEntitlement.test.ts` | buy 100 on 1 Mar, sell 40 on 10 Mar: held before 5 Mar = 100, before 15 Mar = 60 | `<` → `<=` in the day filter (U3 too) |
| U2 | unit · same | no trades → null; a baseline dated after the ex-date → null; a first real BUY after the ex-date → 0 | drop the `isBaseline` branch |
| U3 | unit · same | a buy ON the ex-date (Italian day, an instant of 23:30 UTC the eve) does not count | `getItalyDateIso` → `toISOString().slice(0,10)` |
| U4 | unit · same | announced on 100 × 0,50 with 13,00 tax; sold 40 before → update: 60, 30,00, 7,80, 22,20 | `taxShare` → `0.26` with a 12,5% record |
| U5 | unit · same | `isAutoGenerated: false` → keep; `expenseId` set → keep | drop the first guard |
| U6 | unit · same | all sold before the ex-date → delete; all sold AFTER it → keep | `held < EPSILON` → `held <= dividend.quantity` |
| U7 | unit · same | the four sentences of `describeAnnouncedDividendsOutcome` (0/0 null, 1/0, 0/2, 2/1) | swap the two singular forms |
| T1 | unit · `__tests__/dividendUseCase.test.ts` (new block) | `createAssetTransaction` of a sale → the pending record updated through `updateDividend` with its currency; a hand-entered one untouched; the result carries `{ updated: 1, deleted: 0 }` | remove the call after the commit |
| T2 | unit · same | the reconciliation throwing → the trade's result returned with zeros | remove the `try/catch` |
| P1 | unit · `__tests__/dividendProcessor.test.ts` | an asset at quantity 0 with its last trade 90 days ago → the scraper mock is never called | drop `canBeOwedSince` |
| P2 | unit · same | a scraped dividend with ex-date before a later purchase is created on the earlier quantity | `entitledQuantity` → `asset.quantity` |
| P3 | unit · same | payment day, record at 100, ledger says 0 → deleted, no income; ledger says 60 → income on 60 | skip the verdict in `runExpenseCreation` |
| S1 | unit · `__tests__/dividendScrapeRoute.test.ts` (new) | the button on a sold-out asset: nothing created, `notHeld` counts them | route keeps `asset.quantity` |
| D1 | dom · `__tests__/transactionDialog.announced.test.tsx` | a result with `{ updated: 1, deleted: 0 }` → the toast's sentence; zeros → no toast | toast unconditionally |
| E1 | e2e · `e2e/cashflow.dividendi.spec.ts` | a planted auto-generated dividend with a future ex-date on 10 units; a sale of all 10 through the dialog → «Annunciati» no longer lists it; a decoy hand-entered record stays | remove the reconciliation call |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: after selling the whole position of an instrument with an announced dividend, the
toast reads «1 dividendo annunciato eliminato: allo stacco non avrai più lo strumento.», Dividendi › «Annunciati»
no longer shows it, and no income row appears on its payment day.

- A — the diff. B–E automated by a throwaway Playwright script on the emulators (no control that spends; the
  scraper is never called — records are planted): B sell all → deleted; C sell half → amount halved, tax in
  proportion; D buy more before the ex-date → amount grown; a sale dated AFTER the ex-date → unchanged; a
  hand-entered decoy («ornitorinco») and a cashed one («fenicottero») untouched; E edit the sale's date across the
  ex-date and delete the sale → the record follows each time.
- F — at the owner's «pronto», on the mirror: one sale and one purchase on an instrument with an announced dividend.

## 8. Putting it into service

No DDL, no rules change, no index (the dividends of an asset are already queried by `getDividendsByAsset`). Order:
merge; the first evening cron applies the new scrape rule. Existing stale records are corrected by the payment-day
pass as they fall due, or at the next trade on their asset; nothing is migrated.

## 9. Documentation

- `doc/guide/cashflow-dividendi.md` — new rule «a pending record follows the ledger» (what is touched, what never
  is, the three moments), the scrape's skip, `notHeld`; its § blind spots: a record created before a migration
  baseline keeps today's quantity.
- `doc/guide/registro-operazioni.md` — the trade's answer carries `announcedDividends`; the reconciliation is after
  the transaction, by design.
- `AGENTS.md` § 3 stub of Dividendi — one sentence with the rule and the date.
- `Draft Release Temp.md` — «Dividendi: un dividendo annunciato segue acquisti e vendite fino allo stacco; gli
  strumenti venduti non vengono più cercati».
- `CLAUDE.md` — the Dividendi line gains «a pending record follows the ledger (2026-11)» only if it stays under
  20.000 characters; otherwise the guide alone.
- `doc/dati/README.md` § 6: status row.

## 10. Declared out of scope

- The two withholdings and the currency of a foreign dividend → DATI-07.
- Where a sold-out instrument is listed, and its deletion → DATI-05.
- A one-off pass that rewrites every stale pending record on the day of the deploy → not planned: the payment-day
  net and the next trade cover them; doc/guide/cashflow-dividendi.md § blind spots says so.
- Dividends of instruments outside the ledger's types → unchanged (today's quantity).

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

Implementa la spec così com'è scritta, nell'ordine: il modulo puro con U1–U7 (ognuno visto rosso con
la sua mutazione), il servizio server e l'aggancio nel caso d'uso del registro (T1, T2), lo scrape del
cron e del pulsante e il giorno di pagamento (P1–P3, S1), il toast e l'invalidazione (D1), poi E1
sugli emulatori. Il codice del § 4.1 è già scritto: copialo.

Fermati e chiedimi se: il caso d'uso del registro non è più come lo descrive il § 1 (commit b0bf8276),
la riconciliazione dovrebbe entrare nella transazione per far passare un test, oppure un test
esistente dei dividendi diventa rosso per una ragione che non è la quantità.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec that hooks the trade ledger and two crons (money written by a
server path). Estimated size: M (two new modules, five touched, ~15 tests).
