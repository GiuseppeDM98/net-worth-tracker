# DATI-07 — A dividend in a foreign currency: the instrument's currency, two withholdings, the rate of the payment day

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-04 (the entitlement verdict it extends) and
> DATI-06 (contract C2: `resolveEcbRateToEur`, `TradeFxSource`, `formatFxPair`, `describeTradeFx`, `describeTotalOff`,
> `INSTRUMENT_CURRENCIES`, `normalizeCurrencyAmount`, `isCurrencyAllowed`, `useFxRate`). Written on 2026-11-23; every
> `file:line` is cited @ b0bf8276 (a line number is a hint, the function's name is the anchor). Owner's point 2;
> decisions 7, 63, 64, 65 and 66.

## 1. The problem today (evidence on the code)

- **The currency does not come from the instrument.** The dividend form's «Valuta» is a select of four values
  (EUR, USD, GBP, CHF) defaulting to EUR (`components/dividends/DividendDialog.tsx:601-619`, `defaultValues` `:171`):
  a dividend of a dollar stock is filed in euro unless the owner changes it by hand.
- **The labels say euro whatever the currency**: «Importo lordo per unità (€) *» (`:438`), «Ritenuta per unità (€) *»
  (`:455`).
- **The rate is the one of the moment the record is saved**, not of the payment: `createDividend` converts with
  `getExchangeRateToEur(currency)` — the latest cached rate (`lib/services/dividendService.ts:203-225`) — and
  `updateDividend` converts again with the latest rate whenever it receives a currency (`:310-338`). A dividend
  announced in March and paid in May carries March's rate; the euro actually credited cannot be typed.
- **One withholding.** A foreign dividend is taxed twice: abroad on the gross (15% for a US stock under the treaty)
  and in Italy on what crosses the border (26% on the «netto frontiera»). The form has one field, proposed at the
  instrument's rate over the gross (`:207-212`, `proposedRate` `:185`); the record has one `taxAmount`
  (`types/dividend.ts:28`). The foreign part — the one a tax return may credit — is not recorded.
- The income row takes the euro net when the record was converted (`dividendIncomeAmount`,
  `lib/services/dividendIncomeService.ts:97`), so a wrong rate is a wrong income in Cashflow and a wrong credit on
  the account.

## 2. Goal and acceptance criteria

1. Choosing an instrument on a NEW dividend sets the currency to the instrument's (GBp → GBP); the select offers
   `INSTRUMENT_CURRENCIES`, plus the instrument's own currency when it is not among them. Proof: D1.
2. Every amount label, and every figure of the form's «Riepilogo», carries the record's currency. Proof: D1.
3. An instrument whose ISIN does not start with `IT` — in ANY currency, the euro included — has two per-unit
   withholdings, «Ritenuta estera per unità ({CUR})» and «Ritenuta italiana per unità ({CUR})» (decision 63); one
   with no ISIN has them when its currency is not EUR. The Italian one is proposed at the instrument's rate on gross
   minus the foreign one; the foreign one at the rate of the instrument's last dividend, else 15% for an EQUITY
   whose ISIN starts with `US` (decision 64), else 0. An Italian ISIN keeps the single withholding. Proof: U1, U2,
   D2.
4. The record stores `foreignTaxAmount` beside `taxAmount`, which stays the TOTAL tax (every reader of `taxAmount`
   and `netAmount` is unchanged). Proof: U1, S1.
5. A dividend in a currency other than EUR is converted at the ECB rate of its PAYMENT day; with «Netto accreditato
   in euro» typed, the euro net is exactly that figure and the rate is the one it implies. `exchangeRate` and
   `fxSource` are stored and shown. Proof: U3, U4, S1, D3.
6. A dividend announced for a future day is converted at the latest rate (`fxSource: 'ecb-latest'` — C2 answers
   `isLatest: true` for a future day) and converted again at the payment day's rate by the payment-day cron, before
   the income is created; so is a foreign record announced before this spec, which has no `fxSource` (decision 66).
   Proof: S1, S3, P1.
7. The income row's amount equals the record's euro net. Proof: P1 (the row built from the re-converted record).
8. A pending record recomputed by a trade (DATI-04) scales its foreign tax with the rest. Proof: U5.
9. A euro net more than 25% away from the payment day's ECB rate is refused with a 422 that carries the sentence
   (the guard of C2). Proof: U4, S2, R1.
10. A scraped dividend is taxed at the INSTRUMENT's rate — `taxRate ?? 26`, a rate of 0 stays 0 — where it was a
    fixed 26% (decision 65). Proof: P2, S4.
11. An edit that changes no amount, no currency, no payment day and no credited net resolves no rate and leaves the
    euro figures — and the income row of a cashed record — as they are. Proof: S3.
12. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
    `npm run perf:budget` green with `/dashboard/cashflow` inside its ceiling, raised by no more than 1 KB gz and
    only with the register row (index § 8 rule 7).

## 3. Decisions

- **Decision 7** (owner, 2026-11-23): everything — the currency from the instrument, the right labels, the payment
  day's rate or the euro actually credited, and two distinct withholdings (foreign, Italian on the frontier net).
- **Decision 63** (owner, 2026-11-23): the two withholdings follow the ISSUER, not the currency — an ISIN that does
  not start with `IT`, whatever the currency (a German or a French share in euro is withheld at source too). Only
  the CONVERSION follows the currency. An Irish ETF proposes a foreign withholding of 0.
- **Decision 64** (owner, 2026-11-23): the 15% of the US treaty is proposed for equity only; a US bond's coupon
  proposes 0.
- **Decision 65** (owner, 2026-11-23): a scraped dividend uses the instrument's tax rate, not a fixed 26%.
- **Decision 66** (owner, 2026-11-23): a foreign dividend announced before this spec and still to be paid is
  converted again at its payment day; one already cashed changes only if its amounts are edited.
- Adopted, reversible:
  - (a) the form stays per unit (gross, foreign withholding, Italian withholding), as it is today; the totals are
    derived.
  - (b) `taxAmount` remains the total and `foreignTaxAmount` is its foreign part: no reader of the stats, the tiles or
    the email changes.
  - (c) the foreign rate proposed is a starting point the owner edits (treaty rates differ by country and by broker);
    it is remembered per instrument through its last record, not through a new field on the asset.
  - (d) an automatic (scraped) dividend has a foreign withholding of 0 and the Italian rate of the instrument
    (decision 65: for an instrument whose rate is not 26% the amount changes from the first scrape after the
    deploy; the records already scraped are not rewritten).
  - (e) the euro tax is the difference between the euro gross and the euro net, so the three euro figures add up.
  - (f) the 25% guard is the server's: the form shows its sentence under the field as soon as the preview's rate
    says so, and never disables the submit (the dialog's rule); a save that ignores it gets the 422.
  - (g) amounts on a pound instrument are typed in pounds: pence are never a dividend's currency (C2's
    `normalizeCurrencyAmount` gives the code).
  - (h) a record saved on its payment day before the ECB publishes carries the previous fixing, labelled as the
    day's (the blind spot DATI-06 declares for a trade).

## 4. Solution

### 4.1 Types and schema

`types/dividend.ts` — `Dividend` and `DividendFormData` gain `foreignTaxAmount?: number` (in the record's currency,
part of `taxAmount`; present on an EUR record too when the issuer is foreign) and `settledNetEur?: number` (the euro
credited, from the statement; a non-EUR record only); `Dividend` also `foreignTaxAmountEur?: number` and `fxSource?:
TradeFxSource`. `exchangeRate` keeps its meaning (`:43`).

`lib/server/validation.ts` `dividendDataSchema` (`:46`): `foreignTaxAmount: z.number().finite().min(0).optional()`,
`settledNetEur: z.number().finite().positive().optional()`. The PUT's schema
(`app/api/dividends/[dividendId]/route.ts`, `dividendDataSchema.partial()`) extends both with `.nullable()`: `null`
REMOVES the field (an absent key keeps it) — the convention of C2's `AssetTransactionUpdateData`.

### 4.2 Pure module — `lib/utils/dividendFx.ts` (new, written here)

```ts
/**
 * The taxes and the euro side of a dividend paid in a foreign currency.
 *
 * Such a dividend is withheld twice — abroad on the gross, in Italy on what crosses the border — and is
 * credited in euro at the rate of the day it is paid. Until 2026-11-23 the record had one withholding and
 * the rate of the moment it was saved.
 */
import { roundToCents } from '@/lib/utils/cents';
import { STATEMENT_RATE_TOLERANCE, TradeFxError, type EcbRate, type TradeFxSource } from '@/lib/utils/tradeFx';

export const US_TREATY_RATE = 15;

export interface DividendTaxes {
  foreignTaxAmount: number;
  italianTaxAmount: number;
  /** Foreign + Italian: what `Dividend.taxAmount` stores. */
  taxAmount: number;
  netAmount: number;
}

/** The Italian tax is due on the «netto frontiera»: the gross less the foreign withholding. */
export function computeDividendTaxes(grossAmount: number, foreignTaxRate: number, italianTaxRate: number): DividendTaxes {
  const foreignTaxAmount = (grossAmount * foreignTaxRate) / 100;
  const italianTaxAmount = ((grossAmount - foreignTaxAmount) * italianTaxRate) / 100;
  const taxAmount = foreignTaxAmount + italianTaxAmount;
  return { foreignTaxAmount, italianTaxAmount, taxAmount, netAmount: grossAmount - taxAmount };
}

/**
 * Two withholdings when the issuer is not Italian, whatever the currency (owner, 2026-11-23): by the
 * ISIN's country, and for an instrument with no ISIN by a currency that is not the euro.
 */
export function hasForeignWithholding(isin: string | undefined, currency: string): boolean {
  const code = isin?.trim().toUpperCase() ?? '';
  if (code.length >= 2) return !code.startsWith('IT');
  return currency.toUpperCase() !== 'EUR';
}

/**
 * The foreign rate a new record proposes: the instrument's last one, else the US treaty rate for a
 * share (a bond's interest is not withheld in the US), else none.
 */
export function proposeForeignTaxRate(
  isin: string | undefined,
  assetClass: string | undefined,
  lastForeignRate: number | undefined,
): number {
  if (lastForeignRate !== undefined) return lastForeignRate;
  return assetClass === 'equity' && isin?.trim().toUpperCase().startsWith('US') ? US_TREATY_RATE : 0;
}

/** The foreign rate a stored record implies, undefined when it has no foreign part. */
export function foreignRateOf(record: { grossAmount: number; foreignTaxAmount?: number }): number | undefined {
  if (record.foreignTaxAmount === undefined || !(record.grossAmount > 0)) return undefined;
  return (record.foreignTaxAmount / record.grossAmount) * 100;
}

export interface DividendFxInput {
  grossAmount: number;
  netAmount: number;
  foreignTaxAmount: number;
  settledNetEur?: number;
  ecb: EcbRate | null;
}

export interface DividendFxResolution {
  grossAmountEur: number;
  taxAmountEur: number;
  netAmountEur: number;
  foreignTaxAmountEur: number;
  exchangeRate: number;
  fxSource: TradeFxSource;
}

export function resolveDividendFx(input: DividendFxInput): DividendFxResolution {
  let exchangeRate: number;
  let fxSource: TradeFxSource;
  let netAmountEur: number;
  if (input.settledNetEur !== undefined) {
    if (!(input.netAmount > 0)) throw new TradeFxError('nothing-to-convert');
    exchangeRate = input.settledNetEur / input.netAmount;
    if (input.ecb && Math.abs(exchangeRate / input.ecb.rate - 1) > STATEMENT_RATE_TOLERANCE) {
      throw new TradeFxError('total-off', input.ecb.rate);
    }
    fxSource = 'statement';
    netAmountEur = input.settledNetEur;
  } else {
    if (!input.ecb) throw new TradeFxError('no-rate');
    exchangeRate = input.ecb.rate;
    fxSource = input.ecb.isLatest ? 'ecb-latest' : 'ecb';
    netAmountEur = roundToCents(input.netAmount * exchangeRate);
  }
  const grossAmountEur = roundToCents(input.grossAmount * exchangeRate);
  return {
    grossAmountEur,
    // The difference, so gross − tax = net in euro too.
    taxAmountEur: roundToCents(grossAmountEur - netAmountEur),
    netAmountEur,
    foreignTaxAmountEur: roundToCents(input.foreignTaxAmount * exchangeRate),
    exchangeRate,
    fxSource,
  };
}
```

### 4.3 Server

- `lib/services/dividendService.ts`:
  - `createDividend` (`:174`): for a currency other than EUR the conversion block (`:203-225`) is replaced by
    `resolveDividendFx({ grossAmount, netAmount, foreignTaxAmount: data.foreignTaxAmount ?? 0, settledNetEur:
    data.settledNetEur, ecb: await resolveEcbRateToEur(currency, paymentDate) })`. `no-rate` keeps today's graceful
    path (the record is saved with no euro fields, logged). The document stores the six results plus
    `foreignTaxAmount` and `settledNetEur`. An EUR record stores `foreignTaxAmount` when sent, no euro field, and a
    `settledNetEur` sent with it is dropped.
  - `updateDividend` (`:288`) reads the stored record first and merges: an absent key keeps the stored value, `null`
    removes `foreignTaxAmount` or `settledNetEur`. The rate is resolved again only when a merged value of
    `currency`, `grossAmount`, `netAmount`, `foreignTaxAmount`, `settledNetEur` or the Italian day of `paymentDate`
    DIFFERS from the stored one — the form sends every field at every save, so «the update carries it» would
    convert at each one and move the income of a record already cashed. A merged currency of EUR deletes, with
    `FieldValue.delete()`, `grossAmountEur`, `taxAmountEur`, `netAmountEur`, `foreignTaxAmountEur`, `exchangeRate`,
    `fxSource` and `settledNetEur`; `foreignTaxAmount` stays as merged.
  - **The two functions rethrow a `TradeFxError` untouched** — `if (error instanceof TradeFxError) throw error;`
    before their `catch` wraps the rest in «Failed to create dividend» / «Failed to update dividend».
  - new `reconvertAtPaymentDay(dividend: Dividend): Promise<Dividend>`: for a non-EUR record with no `settledNetEur`
    and `fxSource !== 'ecb'` — `'ecb-latest'`, and the absent `fxSource` of a record saved before this spec
    (decision 66) — it resolves again with the payment day's rate, writes the six euro fields and returns the
    updated record. Any other record is returned as it is, with no read. On `no-rate` it logs and returns the record
    unchanged: the income is built on the euro figures the record has, as today.
- `app/api/dividends/route.ts` (POST) and `app/api/dividends/[dividendId]/route.ts` (PUT): a `TradeFxError` caught
  from the service answers 422 — `total-off` → `{ error: describeTotalOff(currency, error.ecbRate) }`,
  `nothing-to-convert` → `{ error: 'Il netto accreditato in euro richiede un netto maggiore di zero.' }` — before
  the generic 500 (`createDividendWithOptionalExpense` does not intercept it). The POST, which has the asset in
  hand, also answers 400 «Valuta non ammessa per questo strumento.» when `isCurrencyAllowed(currency,
  asset.currency)` is false (C2); the PUT loads no asset and is not given the check — the form's select is its door.
- `lib/server/dividendProcessor.ts`:
  - `runExpenseCreation` (`:200`): the object the pass hands on (`dividendData`, mapped field by field from the
    document, or the record DATI-04 reads back after its update) also carries `foreignTaxAmount`,
    `foreignTaxAmountEur`, `settledNetEur` and `fxSource`. After the entitlement verdict of DATI-04 and before the
    income is built, `dividendData = await reconvertAtPaymentDay(dividendData)`; the income is built from it.
  - `runDividendScraping` (`:144-146`) and the scrape route (`app/api/dividends/scrape/route.ts:161-163`), where the
    tax is today `grossAmount * 0.26`: `computeDividendTaxes(gross, 0, asset.taxRate ?? 26)` (decision 65) — the
    same figures as today for a 26% instrument and for one with no rate, the instrument's own rate otherwise, 0 for
    a rate of 0.
- `lib/utils/dividendEntitlement.ts` (DATI-04, contract C8 — the first of its three extensions): `AnnouncedDividend`
  picks `foreignTaxAmount` too and the `update` verdict gains `foreignTaxAmount: number | undefined` —
  `dividend.foreignTaxAmount === undefined ? undefined : dividend.grossAmount > 0 ? grossAmount *
  (dividend.foreignTaxAmount / dividend.grossAmount) : 0`. `lib/server/dividendEntitlementService.ts` (DATI-04):
  `reconcileAnnouncedDividendsForAsset` passes it to `updateDividend`.

### 4.4 Client — `components/dividends/DividendDialog.tsx`

- The dialog receives the tab's dividends: a new prop `dividends: Dividend[]`, passed by
  `components/dividends/DividendTrackingTab.tsx` (its own `dividends`) at its one mount of `DividendDialog`.
- Choosing an instrument on a new record (`:214-…`, the effect that fills the units) also sets `currency` to
  `normalizeCurrencyAmount(asset.currency, 0).currency` (`GBp` → `GBP`) while the owner has not touched the select;
  the select (`:605-617`) maps `INSTRUMENT_CURRENCIES` plus the chosen instrument's currency when it is not among
  them.
- The labels at `:438` and `:455` take `({currency})` — «(€)» for EUR. The «Riepilogo» (Netto per unità, Lordo
  totale, Ritenute totali, Netto totale) formats with `formatCurrency(value, currency)`; with two withholdings it
  shows «Ritenuta estera» and «Ritenuta italiana» in place of «Ritenute totali».
- **Two withholdings when `hasForeignWithholding(asset.isin, currency)`**: a new field «Ritenuta estera per unità
  ({CUR}) *» before the existing one, renamed «Ritenuta italiana per unità ({CUR}) *»; otherwise the form keeps its
  single field and the foreign part is not counted. Proposals for a NEW record and untouched fields only (the rule
  of `:207-212`): foreign = `gross × proposeForeignTaxRate(asset.isin, asset.assetClass, lastForeignRate) / 100`,
  Italian = `(gross − foreign) × proposedRate / 100`, each showing «proposta al {x}%». `lastForeignRate` is
  `foreignRateOf` of the record of that `assetId`, among `dividends`, with the latest `paymentDate` that has
  `foreignTaxAmount` defined.
- **The reset of an edit.** A record WITH `foreignTaxAmount`: foreign = `foreignTaxAmount / quantity`, Italian =
  `(taxAmount − foreignTaxAmount) / quantity`. A record without it: the foreign field shows 0 and the Italian one
  the saved total. «Netto accreditato in euro» shows the stored `settledNetEur`.
- A new optional field «Netto accreditato in euro», for a currency other than EUR only, with the helper
  «Dall'estratto del conto. Se lo lasci vuoto uso il cambio BCE del giorno di pagamento.»; under it the preview from
  `useFxRate(currency, paymentDay)` (C2): «Cambio BCE del {formatItalianDate(day)}: EUR/USD 1,0961 · netto stimato
  40,05 €», or «Cambio dal tuo accredito: EUR/USD 1,0965»; a payment day in the future reads «Cambio di oggi: quello
  del giorno di pagamento lo applico quando arriva.»; while the rate loads «Leggo il cambio…», on a failed read
  «Cambio non disponibile: il netto in euro si calcola al salvataggio.»; a credited net more than 25% away from the
  rate in hand shows `describeTotalOff` under the field, and the submit stays enabled (§ 3 (f)). A 422 from the
  route is shown where the form shows its other server errors (`error.error`).
- The submit (`:308-311`) sends `taxAmount = (foreign + italian) × units` and `settledNetEur` when typed. On a
  create, `foreignTaxAmount = foreign × units` when the form has two withholdings, the key absent otherwise. On an
  EDIT: `foreignTaxAmount` is sent only when the record had it or the owner touched the foreign field (a record
  without one, corrected in its note, must not gain a foreign part of 0 — the next proposal would read 0%); `null`
  when the form went back to one withholding on a record that had it; `settledNetEur: null` when a stored credit was
  cleared or the currency became EUR.
- `components/dividends/DividendRecordDetailsDialog.tsx`: when `foreignTaxAmount` is present, two rows in place of
  the single one — «Ritenuta estera» = `foreignTaxAmountEur ?? foreignTaxAmount`, «Ritenuta italiana» =
  `(taxAmountEur ?? taxAmount)` minus the first — and, when `fxSource` is, one line: `describeTradeFx(currency,
  exchangeRate, fxSource, paymentDate)`, except for `'ecb-latest'` with a payment day still to come, which reads
  «Cambio di oggi: quello del giorno di pagamento lo applico quando arriva.»

## 5. Constraints and traps

- **`taxAmount` is read by the stats route, the tiles, the email and the PDF**: here it means it stays the total —
  S1 asserts `taxAmount = foreign + italian` on the stored document.
- **`updateDividend`'s `expenseId` sentinel** (`dividendService.ts:347-350`): untouched; the new fields are plain
  optional numbers cleaned by `removeUndefinedFields`.
- **`readCreditableAccount` refuses an account of another currency** (`dividendIncomeService.ts:73-74`): the row of a
  converted dividend is in euro, so the euro account passes — P1 keeps a euro account.
- **Italian day**: the rate's day is the payment date's Italian day (the service of C2 does it).
- **No E2E assertion depends on Frankfurter's answer** (the rule of DATI-06): E1 types a euro net inside the guard
  for any plausible fixing.
- **The service wraps every error** (`dividendService.ts`, the `catch` of `createDividend` and `updateDividend`):
  without the rethrow of § 4.3 a `total-off` reaches the routes as a generic 500.
- **`updateDividend` answers nothing**: the pass re-reads the record after DATI-04's update (`getDividendById`),
  and `reconvertAtPaymentDay` works on that copy — never on the document's raw data, which holds Timestamps.
- **The emulator's cron route scrapes Borsa Italiana first**: the guided verification never calls it (§ 7).
- **Invented figures**: 10 units, 0,50 USD gross a unit, 15% and 26%, net credited 2,88 €.
- **A series label never enters the code.**

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/dividendFx.test.ts` | gross 100, 15% and 26% → foreign 15, Italian 22,10, tax 37,10, net 62,90 | Italian on the gross |
| U2 | unit · same | proposal: last rate 10 → 10; an equity with ISIN `US…` → 15; a bond with ISIN `US…` → 0; ISIN `IE…` → 0; `foreignRateOf` on a record without the field → undefined; `hasForeignWithholding`: `DE…` in EUR → true, `IT…` in USD → false, no ISIN in USD → true, no ISIN in EUR → false | drop the ISIN branch; drop the `equity` test; decide by the currency alone |
| U3 | unit · same | ECB 0,90 → euro gross 90,00, net 56,61, tax 33,39 (the difference), `'ecb'`; latest → `'ecb-latest'`; gross 1,07 at 15% and 26%, ECB 0,90 → euro tax 0,35 (the difference; rounded on its own it is 0,36) | tax = `taxAmount × rate` rounded on its own (the 1,07 case goes red) |
| U4 | unit · same | credited 57,00 on a net of 62,90 with ECB 0,90 → rate 57/62,9, euro net exactly 57,00, euro gross 90,62, `'statement'`; 30% off → `total-off`; a net of 0 → `nothing-to-convert` | the euro gross converted at the ECB rate (90,00) |
| U5 | unit · `__tests__/dividendEntitlement.test.ts` | a record with a foreign part, quantity halved → `foreignTaxAmount` halved; one without → undefined; a gross of 0 → 0 | always 0 |
| S1 | unit · `__tests__/dividendService.fx.test.ts` (new) | `createDividend` in USD with both withholdings: the document has `taxAmount` = their sum, `foreignTaxAmount`, the euro fields, `fxSource`; the rate asked is the PAYMENT day's; a payment day in the future → `'ecb-latest'`; an EUR record of a `DE…` share → `foreignTaxAmount` and no euro field | pass the ex-date |
| S2 | unit · same | a credited euro net 30% off → `createDividend` and `updateDividend` reject with the `TradeFxError` itself (`code` `total-off`, its `ecbRate`); `no-rate` → saved without euro fields | wrap the error like the others |
| S3 | unit · same | `reconvertAtPaymentDay`: a record with `settledNetEur`, one at `'ecb'` and an EUR one are returned unread; one at `'ecb-latest'` and one with no `fxSource` are converted at the payment day's rate; `no-rate` → returned unchanged. `updateDividend`: every field sent unchanged but the note → no rate call, no euro field written; `settledNetEur: null` → the field deleted and the ECB rate applied; the currency changed to EUR → the seven fields deleted | convert whenever the update carries a currency; skip a record with no `fxSource` |
| R1 | unit · `__tests__/dividendRoutesFx.test.ts` (new; the service mocked to reject with `new TradeFxError('total-off', 0.9)`) | POST and PUT answer 422 with `describeTotalOff`'s sentence; `nothing-to-convert` → 422 with its own sentence; the POST with a currency the instrument does not have and the list does not hold → 400 | let it fall to the 500 |
| P1 | unit · `__tests__/dividendProcessor.test.ts` | the object handed to `reconvertAtPaymentDay` carries `settledNetEur` and `fxSource`; a record at `'ecb-latest'` 0,90 whose payment day's rate is 0,95 → the income row is built from the re-converted record; a USD record whose quantity DATI-04 halves → the income on the halved euro net | skip `reconvertAtPaymentDay`; build the income from the copy read before the update |
| P2 | unit · same | a scraped dividend on an instrument at 12,5% → tax 12,5% of the gross; no rate → 26%; a rate of 0 → 0 | `grossAmount * 0.26` |
| S4 | unit · `__tests__/dividendScrapeRoute.test.ts` (DATI-04's) | the button on an instrument at 12,5% → the created record's tax is 12,5% | `grossAmount * 0.26` |
| D1 | dom · `__tests__/dividendDialog.fx.test.tsx` (new) | picking a USD instrument sets «USD» and the labels read «(USD)»; after the owner picks CHF, picking another instrument does not overwrite | set on every pick |
| D2 | dom · same | a US share in USD: two withholding fields with their proposals (15% and the instrument's rate), the «Riepilogo» in USD with the two rows; a `DE…` share in EUR: two fields and no «Netto accreditato in euro»; an `IT…` share: one field; the instrument's last record at 10% → the proposal is 10% | render both for an Italian ISIN |
| D3 | dom · same | the preview line with the mocked rate; a typed credit → «Cambio dal tuo accredito…»; a future payment day → the third sentence; a credit 30% off → the refusal under the field and the submit enabled | one sentence for all |
| D4 | dom · same | an edit of a record with no foreign part, the note changed → the payload has no `foreignTaxAmount` key; a stored credit cleared → `settledNetEur: null`; a record with a foreign part opens with the two per-unit figures | always send `foreignTaxAmount` |
| E1 | e2e · `e2e/cashflow.dividendi.fx.spec.ts` (new; `e2e/cashflow.dividendi.spec.ts` asserts the empty page of the base account and stays as it is) | plants «Azione Alfa» (equity, USD, ISIN `US0000000001`, 10 units) and names an income category for dividends in `assetAllocationTargets/test-user-1` (`dividendIncomeCategoryId`, the document read first and restored in `afterAll`); a dividend of 0,50 a unit entered with the proposed withholdings and «Netto accreditato in euro» 2,88, paid today → the income row in Tracciamento is 2,88 € and the details dialog shows the two withholdings and «dal totale dell'estratto»; removes what it planted by id, in a loop | `settledNetEur` not sent by the form (the income becomes the net at the ECB rate) |

**The harnesses.** `__tests__/dividendUseCase.test.ts` and `__tests__/dividendProcessor.test.ts` REPLACE
`@/lib/services/dividendService` with a mock: the real service runs only in the new
`__tests__/dividendService.fx.test.ts`, whose `adminDb` is a mock that captures `add`, `set` and `update` and which
mocks `@/lib/server/tradeFxService` (`resolveEcbRateToEur`). In `dividendProcessor.test.ts` the mock gains
`reconvertAtPaymentDay` and `getDividendById`.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: a dividend of 0,50 USD on 10 units of a US stock proposes 15% abroad and 26% in
Italy, shows a net of 3,15 USD (5,00 − 0,75 − 1,11 — the Italian tax on 4,25), and with «Netto accreditato in euro»
2,88 files an income of exactly 2,88 € on the day it is paid.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390: B the new record on «Azione
  Alfa» (USD, ISIN `US0000000001`, planted); C the same without the credited euro (the rate line observed, not
  asserted); D an Italian instrument (one withholding, «(€)»); a German share in euro (two withholdings, no credit
  field); an edit of a record saved before this spec (no foreign part); a direct POST with a euro net 30% off → 422
  with the sentence; E the negative cases — a PUT on another account's dividend with `settledNetEur` → 403, the
  co-owner on the owner's account → 200 — and the re-conversion, by a throwaway `scripts/*.tmp.mts` that plants a
  record paid TODAY with `fxSource: 'ecb-latest'` and `exchangeRate: 0.5` and calls `runExpenseCreation` on the
  emulator: the record and its income are at the day's rate. The cron's ROUTE is never called: it scrapes Borsa
  Italiana before anything else. Decoys «ornitorinco», «fenicottero».
- F — at the owner's «pronto», on the mirror: one real foreign dividend from his statement.

## 8. Putting it into service

No rules change (dividends are written by the routes), no index. Nothing is migrated. An existing foreign record
without `fxSource` shows no rate line; one still to be paid is converted again at its payment day by the cron
(decision 66); one already cashed changes only when its amounts, its currency or its payment day are edited. From
the first scrape after the deploy an instrument whose tax rate is not 26% gets its own rate on NEW scraped records
(decision 65). With phase F closed and the commit in `develop`, the owner opens the PR `develop` → `main` (index § 8
rule 13).

## 9. Documentation

- `doc/guide/cashflow-dividendi.md` — new § «A dividend of a foreign issuer» (the two withholdings by the ISIN and
  where each is stored, the conversion by the currency, the three sources of the rate, the re-conversion on the
  payment day, the proposal rule, the edit that resolves only on a changed value, the scrape at the instrument's
  rate); § Per-page blind spots: the foreign rate is a proposal, not a treaty table; a scraped dividend never has a
  foreign part; the foreign tax is recorded and no tax-return view credits it; an automatic coupon of a
  foreign-currency bond is converted at its payment day and has no foreign part; a record saved on its payment day
  before the ECB publishes carries the previous fixing; the PUT does not check the currency against the instrument.
- `doc/guide/assistente-registra.md` § Per-page blind spots — the Assistente does not record a dividend.
- `doc/guide/registro-operazioni.md` § «A trade in a foreign currency» — a pointer: dividends reuse the rate service
  and the guard.
- `doc/guide/server.md` — the 422 of the two dividend routes.
- `README.md` — the line «Multi-currency dividend recording with automatic EUR conversion» becomes «Multi-currency
  dividend recording: the instrument's currency, foreign and Italian withholding, the payment day's ECB rate or the
  euro credited».
- `AGENTS.md` § 3, Dividendi stub — rewritten at equal or shorter length (decision 47). `Draft Release Temp.md` —
  one entry prepended in `## ✨ New Features`, in the file's form: «**Cashflow › Dividendi — dividendi esteri** —
  Added to the dividend form: the instrument's currency, «Ritenuta estera» and «Ritenuta italiana» for a foreign
  issuer, the ECB rate of the payment day or «Netto accreditato in euro» from the statement; a downloaded dividend is
  taxed at the instrument's own rate.»
- `CLAUDE.md` — the Dividendi line rewritten at equal or shorter length; the «Latest» entry REPLACED whole (decision
  46: the date, this spec in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-08»); under 20.000
  characters, counted with `node`.
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- A table of treaty rates by country → not planned; the proposal is editable (doc/guide/cashflow-dividendi.md
  § blind spots).
- The foreign tax credit in a tax-return view → not planned; the amount is recorded
  (doc/guide/cashflow-dividendi.md § Per-page blind spots).
- Coupons of foreign-currency bonds scheduled automatically → they follow the same conversion (payment day), no
  foreign part (doc/guide/cashflow-dividendi.md § Per-page blind spots).
- The Assistente recording a dividend → not planned (doc/guide/assistente-registra.md § Per-page blind spots).
- Rewriting the tax of the dividends already scraped at 26% on an instrument with another rate → not planned: the
  owner edits the record (doc/guide/cashflow-dividendi.md § Per-page blind spots).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-07-valuta-estera-dividendi.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C2, da usare IDENTICO —, regole della serie)
- Leggi doc/guide/cashflow-dividendi.md, doc/guide/registro-operazioni.md (§ A trade in a foreign
  currency), doc/guide/server.md, doc/guide/dialog.md, doc/guide/e2e-playwright.md e
  doc/guide/e2e-emulatori.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (i form e le finestre) e PRODUCT.md prima di disegnare
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

Implementa la spec così com'è scritta, nell'ordine: il modulo puro con U1–U4, l'estensione del verdetto
(U5), il servizio dei dividendi e lo schema nel file di test nuovo (S1–S3), le due route con il 422 (R1:
POST /api/dividends e PUT /api/dividends/[dividendId]), il giorno di pagamento (P1) e lo scrape
all'aliquota dello strumento (P2, S4), la finestra — con la nuova prop `dividends` passata da
DividendTrackingTab — e il dettaglio (D1–D4), poi E1 sugli emulatori, i documenti del § 9 e la riga 07 di
doc/dati/README.md § 6 a `implemented`. OGNI test del § 6 va visto rosso con la sua mutazione. Il codice
del § 4.2 è già scritto: copialo.

Fermati e chiedimi se: il contratto C2 o il C8 in develop non sono quelli dell'indice (nomi o firme
diversi), un lettore di `taxAmount` cambia cifra per una ragione che non è lo scrape all'aliquota dello
strumento (decisione 65, voluta), oppure un'asserzione di E1 dipende dal valore del cambio letto dalla
rete.

Collaudo: § 7 (la route del cron non si chiama mai: scarica da Borsa Italiana), la F al mio «pronto». Un
branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa. A
commit in develop, ricordami la PR develop → main (regola 13 dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an M spec on a money path (the income row, a cron) built on a shared
contract. Estimated size: M (one new module, thirteen touched, 18 tests).
