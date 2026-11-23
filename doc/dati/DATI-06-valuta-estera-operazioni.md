# DATI-06 — A trade in a foreign currency: the fee in that currency, the euro total of the statement, the rate kept

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing (DATI-07 and DATI-16 depend on it).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 2; decisions 5, 6 and 8. Defines the
> shared contract **C2** (index § 7).

## 1. The problem today (evidence on the code)

The owner asked how to record a stock bought on the US market, in dollars. **It can be recorded today**: the
instrument carries `currency: 'USD'`, each trade's price is typed in dollars, and the server turns it into euro with
the ECB rate (Frankfurter) of the trade's Italian day — `resolveTradePriceEur(currency, pricePerUnit, date)`,
`lib/server/tradeFxService.ts:82-105`, called by `prepareCreate` (`lib/server/assetTransactionUseCase.ts:288`).
Cost basis, gains, taxes and XIRR are all euro against euro. What is wrong is everything around that conversion:

1. **The rate cannot be the broker's.** The server always uses the ECB fixing; the broker applies its own rate and
   spread, so the debit on the settlement account (`computeCashDelta`, `lib/utils/assetTransactionUtils.ts:371-375`)
   never matches the statement. No field takes the euro actually debited.
2. **The rate used is neither stored nor shown**, and when the day's fixing is missing the service falls back to
   today's rate in silence (`tradeFxService.ts:97-101`). `AssetTransaction` has `priceEur` and nothing else
   (`types/assetTransactions.ts:44-74`).
3. **The fee is euro only** («Commissioni (€)», `components/assets/TransactionDialog.tsx:735`; `fees` «total EUR
   commissions», `types/assetTransactions.ts:54`); a US order's fee is in dollars (the owner's order screen: total in
   dollars with a euro estimate, fee in USD).
4. **The preview uses today's ratio, not the day's** (`estimateTradePriceEur`, `TransactionDialog.tsx:142-154`,
   «Totale stimato» `:834`), and the answer does not return `priceEur`
   (`lib/services/assetTransactionService.ts:36-42`), so Accumulo files an ESTIMATED amount
   (`TransactionDialog.tsx:515` → `buildRegisteredLinePatch`, `lib/utils/accumulationPlanUtils.ts:570-577`).
5. **The currency is free text, decided after the price is typed**: an `<Input>` defaulting to «EUR»
   (`components/assets/AssetDialog.tsx:2147-2152`), overwritten by Yahoo's at submit (`:1592`, `:1606`).
6. **A cash account in dollars is valued one to one** (the price updater skips cash, `lib/helpers/priceUpdater.ts:69-77`)
   and a trade settled on it adds a euro delta to a dollar balance; `assertCashSettlementAsset`
   (`assetTransactionUseCase.ts:202-208`) does not look at the currency.
7. `tradeFxService` has no test and no E2E trades a foreign instrument (`seed-aapl`, `scripts/seedEmulator.ts:87-101`,
   has no trade).

## 2. Goal and acceptance criteria

On an instrument in a foreign currency the owner types what the broker shows — price and fee in that currency — and,
when he has it, the euro total of the statement; the app derives the rate from it, debits exactly that total, and
shows which rate each trade used.

1. On a non-EUR instrument the trade form shows «Prezzo ({CUR})», «Commissioni ({CUR})» and an optional «Totale
   addebitato in euro» (buy) / «Totale accreditato in euro» (sell). On an EUR instrument the form is today's. Proof: D1.
2. With the euro total, the settlement account moves by exactly that total (a sale: minus the withheld tax), to the
   cent; the trade stores `priceEur`, `fees` (euro), `feesNative`, `settledTotalEur`, `fxRate`, `fxSource:
   'statement'`. Proof: U1, U2, T1.
3. Without the total, the ECB rate of the trade's Italian day converts price and fee; `fxSource` is `'ecb'`, or
   `'ecb-latest'` when the day's fixing was missing and the latest one was used. Proof: U3, F1, T2.
4. A euro total more than 25% away from the day's ECB rate is refused with a sentence that shows the rate. Proof: U4, T3.
5. The fee's cashflow row is written in euro from `fees`, as today. Proof: T1 (the fee plan receives the converted fee).
6. Movimenti shows, under a foreign trade, the rate and its source. Proof: U5, D2.
7. Before saving, the form shows the ECB rate of the chosen day and the total it gives; with a euro total typed, the
   rate it implies. Proof: D1, R1.
8. The trade's answer carries `priceEur` and `feesEur`; Accumulo files the real amount. Proof: T1, D3.
9. An edit that changes quantity, price, fee, total, type or date resolves the rate again; any other edit keeps the
   stored one. Clearing the euro total falls back to the ECB rate. Proof: T4.
10. The instrument's currency is a select placed before the price fields; a ticker lookup sets it when the owner has
    not touched it. Proof: D4.
11. A cash account is created in euro only; an existing one in another currency says so, is refused as a settlement
    account by the server (422) and is absent from the trade form's account list. Proof: T5, D5.
12. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
    `npm run perf:budget` `/dashboard/assets` within 1 KB gz of `develop`.

## 3. Decisions

- **Decision 5** (owner, 2026-11-23): an optional euro amount from the statement replaces the ECB conversion; the
  rate it implies is stored and shown.
- **Decision 8** (owner, 2026-11-23): on a foreign instrument price AND fee are typed in its currency; the euro
  total is all-inclusive; the rate is derived from it and the debit matches the statement to the cent.
- **Decision 6** (owner, 2026-11-23): cash accounts stay in euro; an existing foreign one is declared and is not a
  settlement account.
- Adopted, reversible:
  - (a) **the stored rate is euro per one unit of the instrument's currency** (the format of `Dividend.exchangeRate`,
    `types/dividend.ts:43`); it is SHOWN as the pair an Italian reader knows, «EUR/USD 1,0961» (its inverse).
  - (b) on a sale the euro total is what is credited net of the fee and BEFORE the withheld tax, which keeps its own
    euro field (`withheldTaxEur`).
  - (c) the 25% guard is a typing net (a slipped decimal is a factor of ten), not a judgement on the broker's spread;
    it is skipped when no ECB rate can be read.
  - (d) a new read-only route gives the form the day's ECB rate, so the preview is the figure the server will use.
  - (e) a trade saved before this spec keeps its euro fee: its edit form shows the native fee field empty with a line
    that says so; typing a native fee converts it from then on.
  - (f) the currency select lists thirteen currencies Frankfurter quotes (§ 4.6), plus the instrument's own when it is
    not among them (a legacy `GBp`).

## 4. Solution

### 4.1 Types — `types/assetTransactions.ts`

`AssetTransaction` gains, all optional and all absent on an EUR instrument and on a trade saved before 2026-11:

```ts
  // Foreign-currency instruments only (2026-11-23).
  feesNative?: number;        // the fee as the broker charged it, in the instrument's currency; `fees` is its euro value
  settledTotalEur?: number;   // the statement's euro total: buy = debited, fee included; sell = credited net of the fee, before withheldTaxEur
  fxRate?: number;            // euro per ONE unit of the instrument's currency used for priceEur and fees
  fxSource?: TradeFxSource;   // where fxRate came from
```

`AssetTransactionFormData` gains `feesNative?: number` and `settledTotalEur?: number`. `TradeFxSource` is exported by
the pure module below.

### 4.2 Pure module — `lib/utils/tradeFx.ts` (new, written here)

```ts
/**
 * The euro side of a trade in a foreign currency.
 *
 * The owner types what the broker shows: price and fee in the instrument's currency and, when the
 * statement is in hand, the euro total that left (or reached) the account. From that total comes the
 * rate — the broker's, spread included — and the euro price is what is left once the fee is taken out,
 * so quantity × price ± fee IS the statement's total, to the cent. Without it the ECB rate of the
 * trade's day converts both. Either way the rate and its source stay on the trade (2026-11-23: until
 * then the rate was never stored and a missing fixing fell back to today's in silence).
 */
import { roundToCents } from '@/lib/utils/cents';
import { formatItalianDate } from '@/lib/utils/dateHelpers';

export type TradeFxSource = 'statement' | 'ecb' | 'ecb-latest';

export interface EcbRate {
  /** Euro per one unit of the currency. */
  rate: number;
  /** True when the day's fixing was not available and the latest one answered. */
  isLatest: boolean;
}

export interface TradeFxInput {
  type: 'buy' | 'sell';
  quantity: number;
  pricePerUnit: number;
  feesNative: number;
  settledTotalEur?: number;
  ecb: EcbRate | null;
}

export interface TradeFxResolution {
  priceEur: number;
  feesEur: number;
  fxRate: number;
  fxSource: TradeFxSource;
}

/** How far from the day's ECB rate a statement's implied rate may be before it reads as a typo. */
export const STATEMENT_RATE_TOLERANCE = 0.25;

export type TradeFxErrorCode = 'no-rate' | 'total-off' | 'nothing-to-convert';

export class TradeFxError extends Error {
  constructor(public readonly code: TradeFxErrorCode, public readonly ecbRate?: number) {
    super(code);
    Object.setPrototypeOf(this, TradeFxError.prototype);
  }
}

/** What the trade is worth in the instrument's currency: a buy pays the fee on top, a sale loses it. */
export function nativeTotal(input: Pick<TradeFxInput, 'type' | 'quantity' | 'pricePerUnit' | 'feesNative'>): number {
  const gross = input.quantity * input.pricePerUnit;
  return input.type === 'buy' ? gross + input.feesNative : gross - input.feesNative;
}

export function resolveTradeFx(input: TradeFxInput): TradeFxResolution {
  if (input.settledTotalEur === undefined) {
    if (!input.ecb) throw new TradeFxError('no-rate');
    return {
      priceEur: input.pricePerUnit * input.ecb.rate,
      feesEur: roundToCents(input.feesNative * input.ecb.rate),
      fxRate: input.ecb.rate,
      fxSource: input.ecb.isLatest ? 'ecb-latest' : 'ecb',
    };
  }
  const native = nativeTotal(input);
  if (native <= 0 || input.quantity <= 0) throw new TradeFxError('nothing-to-convert');
  const fxRate = input.settledTotalEur / native;
  if (input.ecb && Math.abs(fxRate / input.ecb.rate - 1) > STATEMENT_RATE_TOLERANCE) {
    throw new TradeFxError('total-off', input.ecb.rate);
  }
  const feesEur = roundToCents(input.feesNative * fxRate);
  // Buy: quantity × priceEur + fees = total. Sale: quantity × priceEur − fees = total.
  const titlesEur = input.type === 'buy' ? input.settledTotalEur - feesEur : input.settledTotalEur + feesEur;
  return { priceEur: titlesEur / input.quantity, feesEur, fxRate, fxSource: 'statement' };
}

/** «EUR/USD 1,0961»: the pair as it is quoted, the inverse of the stored euro-per-unit rate. */
export function formatFxPair(currency: string, fxRate: number): string {
  const code = currency === 'GBp' ? 'GBP' : currency.toUpperCase();
  const quoted = (1 / fxRate).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `EUR/${code} ${quoted}`;
}

/** The line under a foreign trade in Movimenti. */
export function describeTradeFx(currency: string, fxRate: number, fxSource: TradeFxSource, tradeDate: Date): string {
  const pair = formatFxPair(currency, fxRate);
  if (fxSource === 'statement') return `${pair} · dal totale dell'estratto`;
  if (fxSource === 'ecb') return `${pair} · BCE del ${formatItalianDate(tradeDate)}`;
  return `${pair} · BCE più recente: quello del giorno non era disponibile`;
}

/** The refusal of a euro total that does not agree with the day's rate. */
export function describeTotalOff(currency: string, ecbRate: number): string {
  return `Il totale in euro non torna con il cambio del giorno (${formatFxPair(currency, ecbRate)}): controlla la cifra.`;
}
```

### 4.3 Server

- `lib/server/tradeFxService.ts`: new `resolveEcbRateToEur(currency: string, date: Date): Promise<EcbRate | null>` —
  the day's fixing (`fetchFrankfurterRateToEur`, `:45-62`) → `{ rate, isLatest: false }`; else the cached latest
  (`getExchangeRateToEur`) → `{ rate, isLatest: true }`; else null. It normalizes `GBp` like `:66-70`. When the
  day asked is today (the `latest` path of `:50`), `isLatest` is false: today's rate IS the day's.
  `resolveTradePriceEur` stays for EUR instruments and for the migration (`resolveBaselinePriceEur`, `:118-135`).
- `lib/server/validation.ts` (`:89-103`): the base schema gains `feesNative: z.number().finite().min(0).optional()`
  and `settledTotalEur: z.number().finite().positive().optional()`; the update schema (`:153-156`) makes both
  `.nullable()` (null = remove the field). `refineAssetTransaction` (`:106-148`) adds: on an adjustment neither is
  allowed («Una rettifica non prevede commissioni.» / «Una rettifica non movimenta liquidità.», the existing words);
  `fees` together with `feesNative` → «Indica la commissione in una sola valuta.»; `settledTotalEur` together with
  `fees` → the same sentence.
- `lib/server/assetTransactionUseCase.ts`:
  - `prepareCreate` (`:278`): for an EUR instrument, unchanged, and `feesNative`/`settledTotalEur` present →
    `TradeUseCaseError(422, 'Commissione in valuta e totale in euro valgono solo per uno strumento in valuta.')`.
    For a non-EUR one, a private `resolveForeignTrade(currency, data)` reads `resolveEcbRateToEur`, calls
    `resolveTradeFx({ type, quantity, pricePerUnit, feesNative: data.feesNative ?? 0, settledTotalEur, ecb })` and
    maps `TradeFxError`: `no-rate` → the existing `TradeFxUnavailableError` (503), `total-off` → 422 with
    `describeTotalOff`, `nothing-to-convert` → 422 «Il totale in euro richiede quantità e prezzo.». The trade takes
    `priceEur`, `fees: data.feesNative !== undefined ? feesEur : data.fees`, `feesNative`, `settledTotalEur`,
    `fxRate`, `fxSource`. An adjustment on a non-EUR instrument converts its price with the ECB rate and stores
    `fxRate`/`fxSource` too.
  - `prepareEdit` (`:330`, the re-resolution at `:373-377`): the rate is resolved again when any of `pricePerUnit`,
    `date`, `quantity`, `type`, `feesNative`, `settledTotalEur` is in the update; otherwise `priceEur`, `fees` and
    the four fields are the stored ones. `null` for `feesNative` or `settledTotalEur` removes it
    (`buildTradeUpdateDocData`, `:153`, deletes the field as it does for the other optional ones).
  - `assertCashSettlementAsset` (`:202-208`): also refuses `(data.currency ?? 'EUR').toUpperCase() !== 'EUR'` with
    `TradeUseCaseError(422, 'Il conto di regolamento deve essere in euro.')`.
  - `TradeMutationResult` (`:80`) gains `priceEur: number` and `feesEur: number` (the trade's `priceEur` and
    `fees ?? 0`; a delete carries zeros). `docToAssetTransaction` (`:104`) and `buildTradeSetDocData` (`:127`) map
    the four fields.
- New route `app/api/fx/rate/route.ts`, `GET ?currency=USD&date=YYYY-MM-DD`: `requireFirebaseAuth`, the query parsed
  with `parseOr400` (`currency`: `/^[A-Za-z]{3}$/`, `date`: `isoDateSchema`), answers `{ rate, isLatest }` from
  `resolveEcbRateToEur`, 503 when null. No account data: no `assertCanAccessAccount`.

### 4.4 Client — the trade form (`components/assets/TransactionDialog.tsx`)

- `lib/hooks/useFxRate.ts`: `useFxRate(currency: string | undefined, isoDay: string | undefined)` → `useQuery` on
  `queryKeys.fx.rate(currency, isoDay)` (new key `fx: { rate: (currency: string, isoDay: string) => ['fx', 'rate',
  currency, isoDay] as const }`), `authenticatedFetch('/api/fx/rate?…')`, `staleTime` one hour, enabled only for a
  non-EUR instrument with a valid day.
- For a non-EUR instrument (not a baseline, not an adjustment): the fee field (`:735`) reads «Commissioni ({CUR})»
  and binds `feesNative`; a new field under it, «Totale addebitato in euro» on a buy / «Totale accreditato in euro»
  on a sale, optional, with the helper «Dall'estratto del broker, commissione inclusa. Se lo lasci vuoto uso il
  cambio BCE del giorno.» (sale: «Dall'estratto del broker, al netto della commissione e prima delle tasse
  trattenute. …»).
- The preview (`:364`, `:379`, `:834`) calls `resolveTradeFx` with the hook's rate: «Cambio BCE del {dd/mm/yyyy}:
  EUR/USD 1,0961 · totale stimato 814,56 €»; with a euro total typed, «Cambio dal tuo totale: EUR/USD 1,0965»; a
  `total-off` shows `describeTotalOff` under the field and disables «Salva»; while the rate loads the line says
  «Leggo il cambio…», on a failed read «Cambio non disponibile: il totale si calcola al salvataggio.»
  `estimateTradePriceEur` (`:142-154`) is deleted.
- Editing a trade with `fees` and no `feesNative` (saved before 2026-11): the native field is empty and its helper
  reads «Commissione registrata in euro: {x} €. Resta così finché non la scrivi in {CUR}.»; the payload then carries
  neither fee field.
- `onCreated?.(result, formData, result.priceEur)` (`:515`): the third argument is the server's figure.
- The settlement-account list keeps only cash accounts whose currency is EUR.
- `components/assets/AssetMovementsDialog.tsx`: under a row that has `fxRate` and `fxSource`, one line in
  `text-[11px] text-muted-foreground`: `describeTradeFx(asset.currency, fxRate, fxSource, date)`; a fee shows
  «{feesNative} {CUR} ({fees} €)» when `feesNative` is present.

### 4.5 Accumulo

`buildRegisteredLinePatch` (`lib/utils/accumulationPlanUtils.ts:570-577`) is unchanged; its caller now receives the
server's `priceEur` through `onCreated`, so `executedAmountEur` is the real amount.

### 4.6 The instrument's currency and the cash accounts

- `lib/constants/currencies.ts` (new): `export const INSTRUMENT_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY',
  'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'HKD', 'SGD', 'PLN'] as const;`.
- `components/assets/AssetDialog.tsx`: the «Valuta *» input (`:2147-2152`) becomes a `Select` over
  `INSTRUMENT_CURRENCIES` (plus the asset's own currency when it is not in the list), rendered ABOVE the price fields
  of the same section; for `type === 'cash'` it is not rendered and the value is `'EUR'`. On blur of the ticker field
  of a ledger type, one `fetchMarketPrice` (`:148-187`) sets `currency` from the quote when the owner has not changed
  the select (`dirtyFields.currency` false) and shows «Valuta rilevata: {CUR}» under it; the assignment at submit
  (`:1592`, `:1606`) stays as the net.
- `components/assets/CashAccountDialog.tsx`: for a cash account whose currency is not EUR, a warning line above the
  rows: «Conto in {CUR}: l'app lo conta come se fossero euro e non può regolare operazioni. Riscrivi il saldo in
  euro: salvando diventa un conto in euro.» Saving it through `AssetDialog` writes `currency: 'EUR'`.

## 5. Constraints and traps

- **`removeUndefinedDeep` / the optional-field-deletion trap** (AGENTS.md § Firestore Writes): here it means the four
  new fields are deleted, not written as `undefined`, when an edit clears them — through the path
  `buildTradeUpdateDocData` already has.
- **`runTransaction`: all reads before writes**: here it means the rate is resolved in `prepare*` (network), never
  inside `commitTradeMutation` — as `priceEur` is today.
- **`isoDateSchema` + `parseOr400`** (AGENTS.md § Server): the new route uses both.
- **Italian day**: the rate's day is the trade's Italian day (`formatItalyIsoDay`, `tradeFxService.ts:35-39`); the
  form sends the day it shows.
- **Cents** (`lib/utils/cents.ts`): the fee is rounded, the euro price is not (it is a unit price, as today); the
  cash delta is rounded once, by `computeCashDelta`.
- **A probe never opens a control that spends** — none here; but **E2E must not depend on Frankfurter**: E1 types a
  euro total inside the tolerance of any plausible rate (0,90 € per dollar) and asserts on the stored trade and the
  account; the ECB line of the preview is asserted in D1 with the hook mocked, never in E2E.
- **No owner data**: figures are invented (10 units at 50,00 USD, fee 5,00 USD, total 500,00 €); the owner's order
  screen is not reproduced.
- **A series label never enters the code.** Comments say «2026-11-23».
- **The fee as a spending row** (doc/guide/registro-operazioni.md): the row's amount is `fees` (euro); nothing in
  `lib/utils/tradeFeeExpense.ts` changes.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/tradeFx.test.ts` | buy 10 × 50 USD, fee 5 USD, total 460,00 € → rate 460/505, fee 4,55 €, `10 × priceEur + 4,55 = 460,00` | `titlesEur` = total for a buy |
| U2 | unit · same | sale of the same → `10 × priceEur − fee = total`; `fxSource: 'statement'` | swap the two signs |
| U3 | unit · same | no total, ECB 0,90 → price 45, fee 4,50, `'ecb'`; `isLatest` → `'ecb-latest'`; no ECB → `no-rate` | drop the `isLatest` branch |
| U4 | unit · same | a total implying a rate 30% off → `total-off` with the ECB rate; 20% off → accepted; no ECB → accepted | tolerance → 0,5 |
| U5 | unit · same | `formatFxPair('USD', 0.9123)` = «EUR/USD 1,0961»; the three sentences of `describeTradeFx`; `GBp` reads GBP | print `fxRate` instead of its inverse |
| F1 | unit · `__tests__/tradeFxService.test.ts` (new, `fetch` mocked) | a past day → the day's path and `isLatest: false`; the day missing → the cached latest and `true`; both failing → null | return `isLatest: false` on the fallback |
| T1 | unit · `__tests__/assetTransactionUseCase.fx.test.ts` (new) | create on a USD asset with fee and total: the stored doc has the six fields; the cash delta is −total; the fee plan receives the euro fee; the result carries `priceEur`, `feesEur` | `fees: data.fees` kept for a native fee |
| T2 | unit · same | no total: `fxSource: 'ecb'`, `fxRate` the mocked rate | `fxSource` hard-coded |
| T3 | unit · same | total off → 422 with the sentence; an EUR asset with `feesNative` → 422 | skip the EUR guard |
| T4 | unit · same | editing the note keeps the rate (no rate call); editing the quantity resolves again; `settledTotalEur: null` falls back to ECB and deletes the field | reuse the stored rate on a quantity change |
| T5 | unit · same | settlement on a USD cash account → 422 «…deve essere in euro.» | drop the currency test |
| R1 | unit · `__tests__/fxRateRoute.test.ts` (new) | 401 without a token; 400 on `currency=US`; 200 `{ rate, isLatest }`; 503 on null | skip `parseOr400` |
| D1 | dom · `__tests__/transactionDialog.fx.test.tsx` (new) | USD asset: the three labels; the ECB line with the mocked rate; a total typed → «Cambio dal tuo totale…»; a total 30% off → the refusal and «Salva» disabled; EUR asset: none of it | render the fields for EUR too |
| D2 | dom · `__tests__/assetMovementsDialog.fx.test.tsx` (new) | a trade with `fxSource: 'statement'` shows its line; one without `fxRate` shows none | show the line unconditionally |
| D3 | dom · same file as D1 | `onCreated` receives the result's `priceEur` | pass the estimate |
| D4 | dom · `__tests__/assetDialog.currency.test.tsx` (new) | the currency is a combobox above the price; a lookup returning USD sets it; after the owner picked CHF the lookup does not overwrite | set on every lookup |
| D5 | dom · same file as D1 | a USD cash account is not in the settlement list | no filter |
| E1 | e2e · `e2e/assets.fx.spec.ts` (new) | a USD instrument and a euro account planted; a buy of 10 at 50 with fee 5 and total 460,00 through the dialog → the account's balance fell by exactly 460,00 and Movimenti shows «dal totale dell'estratto» | `titlesEur` mutation of U1 |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: buying 10 units at 50,00 USD with a 5,00 USD fee and «Totale addebitato in euro»
460,00 takes exactly 460,00 € from the chosen account, files a fee row of 4,55 € in Cashflow, and Movimenti reads
«EUR/USD 1,0978 · dal totale dell'estratto»; the same purchase with the total left empty reads «BCE del {giorno}».

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390 (the preview's ECB line is
  the only network read; it is observed, not asserted): B the buy with a total; C the buy without; D a total with a
  slipped decimal (46,00) → refused; a sale with a withheld tax; an edit of the quantity; clearing the total; E a
  USD cash account planted («ornitorinco») → absent from the list, its dialog shows the warning; the currency select
  on a new instrument.
- F — at the owner's «pronto», on the mirror: one real order copied from his broker's statement.

## 8. Putting it into service

No rules change (the trade documents are server-written), no index. Existing trades are untouched: they have no
`fxRate`, so Movimenti shows no rate line for them. Measure: `perf:budget` on `/dashboard/assets` (stop above +1 KB).

## 9. Documentation

- `doc/guide/registro-operazioni.md` — new § «A trade in a foreign currency» (the two inputs, the derivation, the
  three sources, the guard, the edit rule, legacy fees); the `:23-28` and `:171-174` passages on FX rewritten.
- `doc/guide/patrimonio.md` — the currency select, the euro-only cash accounts; § blind spots: a hand-typed price on
  a foreign instrument leaves `currentPriceEur` as it was until the next quote; a migration baseline converts at
  today's ratio; `GBp` is a legacy value; the other account pickers (Cashflow) still list a foreign cash account.
- `doc/guide/server.md` — the new route.
- `README.md` — the feature lines that say prices are converted at the ECB rate (`:22`, `:26`, `:89`) gain the
  statement's total.
- `AGENTS.md` § 3, Registro operazioni stub — one sentence. `CLAUDE.md` — Registro operazioni line: «a foreign trade
  keeps its rate and takes the statement's euro total (2026-11)», under 20.000 characters.
- `Draft Release Temp.md` — «Operazioni in valuta: commissione nella valuta dello strumento, totale in euro
  dell'estratto, cambio mostrato in Movimenti» and «Conti liquidi solo in euro».
- `doc/dati/README.md` § 6 and § 7 (C2 as built).

## 10. Declared out of scope

- Dividends in a foreign currency → DATI-07.
- The Assistente recording a foreign trade → DATI-16 (it uses C2 as is).
- A cash account truly held in a foreign currency (valued at the day's rate, moving dollars) → not planned
  (decision 6).
- `currentPriceEur` after a hand-typed price; the baseline's rate; `GBp` → doc/guide/patrimonio.md § blind spots.
- The other account pickers excluding a foreign cash account → doc/guide/patrimonio.md § blind spots.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-06-valuta-estera-operazioni.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C2 —, regole della serie)
- Leggi doc/guide/registro-operazioni.md, doc/guide/patrimonio.md, doc/guide/server.md,
  doc/guide/dialog.md, doc/guide/accumulo.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice
  in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: il modulo puro con U1–U5 (ognuno visto rosso con
la sua mutazione), il servizio del cambio (F1), lo schema e il caso d'uso (T1–T5), la route del cambio
(R1), la finestra dell'operazione e Movimenti (D1–D3, D5), la valuta dello strumento e i conti (D4),
poi E1 sugli emulatori. Il codice del § 4.2 è già scritto: copialo.

Fermati e chiedimi se: il caso d'uso del registro non è più come lo descrive il § 1 (commit b0bf8276),
il totale dell'estratto non coincide al centesimo con il movimento del conto in un caso che il § 4.2
non prevede, oppure E1 dipende dalla rete.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec on the trade ledger's money path that defines a shared contract.
Estimated size: L (three new modules, one route, the schema, the use case, two dialogs; ~18 tests).
