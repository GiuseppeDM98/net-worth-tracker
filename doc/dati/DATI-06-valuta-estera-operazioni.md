# DATI-06 — A trade in a foreign currency: the fee in that currency, the euro total of the statement, the rate kept

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-04 (it extends the trade's answer DATI-04
> leaves and relies on its `scheduleCouponsForOpenedPosition`); DATI-07, DATI-16, DATI-18 and DATI-20 depend on it.
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a line number is a hint, the function's name is the
> anchor). Owner's point 2; decisions 5, 6, 8, 59, 60, 61 and 62. Defines the shared contract **C2** (index § 7).

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
8. **A new instrument's first purchase is a second, poorer form.** `AssetDialog`'s section «Posizione iniziale (primo
   acquisto)» builds the first trade itself (`firstBuy`, in the `ledgerCreateFlow` branch of the submit): the fee in
   euro («Commissioni (€)», `openingFees`), every cash account offered (`openingCashAssetId`), no preview. Whatever the
   trade form learns, this one does not.

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
   stored one. Clearing the euro total falls back to the ECB rate. On a trade saved with a euro fee, a euro total
   typed alone INCLUDES that fee (decision 61). Proof: T4, U6.
10. The instrument's currency is a select placed before the price fields; on a NEW instrument a ticker lookup sets it
    when the owner has not touched it; an instrument with operations in the Registro does not change currency.
    Proof: D4.
11. A cash account is created in euro only; an existing one in another currency says so, is absent from the trade
    form's account list and is refused by the server (422) when a trade CHOOSES it; a trade already settled on it
    stays editable (decision 62). Proof: T5, D5, D6.
12. One form for every purchase: a new instrument of a ledger type is created empty and the trade form opens on it for
    its first purchase; `AssetDialog` no longer builds a trade (decision 60). Proof: D7, E1.
13. One currency rule, one function: pence (`GBp`) are pounds with the amount divided by 100; a currency outside the
    thirteen is accepted only as an instrument's own (decision 59). Proof: C1.
14. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
    `npm run perf:budget` green with `/dashboard/assets` and `/dashboard/allocation` (both import the two dialogs)
    inside their ceilings, raised by no more than 1 KB gz and only with the register row (index § 8 rule 7).

## 3. Decisions

- **Decision 5** (owner, 2026-11-23): an optional euro amount from the statement replaces the ECB conversion; the
  rate it implies is stored and shown.
- **Decision 8** (owner, 2026-11-23): on a foreign instrument price AND fee are typed in its currency; the euro
  total is all-inclusive; the rate is derived from it and the debit matches the statement to the cent.
- **Decision 6** (owner, 2026-11-23): cash accounts stay in euro; an existing foreign one is declared and is not a
  settlement account.
- **Decision 59** (owner, 2026-11-23): ONE currency rule for the whole app — `GBp` is GBP with the amount ÷ 100; a
  currency outside the thirteen is allowed only as the own currency of an instrument (from Patrimonio, or already
  held); the Assistente refuses a NEW instrument in such a currency with one line (DATI-16). The rule is one function
  in `lib/constants/currencies.ts`, created here and used by DATI-07 and DATI-16.
- **Decision 60** (owner, 2026-11-23): ONE form for every purchase. `AssetDialog` creates the instrument empty and
  hands it to `TransactionDialog` for the first purchase; DATI-18 (accrued interest), DATI-20 (the lot warning),
  DATI-21 (the premium line) and DATI-16 (the Assistente's prefill) meet one form, not two.
- **Decision 61** (owner, 2026-11-23): on a trade saved before this spec with a fee in euro, a «Totale addebitato in
  euro» typed alone INCLUDES that fee: the titles are worth the total minus the fee (a sale: plus), the rate comes
  from the titles' value, the account moves by exactly the total and the fee's cashflow row stays as it is.
- **Decision 62** (owner, 2026-11-23): the settlement account's currency is checked only when the account CHANGES. A
  trade already settled on a foreign account can be edited in everything else; the form shows that account as
  «{nome} (in {CUR}, non più selezionabile)».
- Adopted, reversible:
  - (a) **the stored rate is euro per one unit of the instrument's currency** (the format of `Dividend.exchangeRate`,
    `types/dividend.ts:43`); it is SHOWN as the pair an Italian reader knows, «EUR/USD 1,0961» (its inverse).
  - (b) on a sale the euro total is what is credited net of the fee and BEFORE the withheld tax, which keeps its own
    euro field (`withheldTaxEur`).
  - (c) the 25% guard is a typing net (a slipped decimal is a factor of ten), not a judgement on the broker's spread;
    it is skipped when no ECB rate can be read.
  - (d) a new read-only route gives the form the day's ECB rate, so the preview is the figure the server will use.
  - (e) a trade saved before this spec keeps its euro fee: its edit form shows the native fee field empty with a line
    that says so; a native fee typed there REPLACES the euro one (the server converts it from then on).
  - (f) the currency select lists thirteen currencies Frankfurter quotes (§ 4.6), plus the form's current value when
    it is not among them (a legacy `GBp`, or a currency a ticker lookup found).
  - (g) the line «BCE del {giorno}» names the TRADE's day: on a weekend or a holiday Frankfurter answers with the
    previous working day's fixing, and today before the ECB publishes (about 16:00 CET) with yesterday's. Declared in
    the guide's blind spots, not shown.
  - (h) a migration's opening position never takes `fxRate`/`fxSource`: its euro price is the migration's, and its
    row shows no rate line, edited or not.
  - (i) the committed E2E reads the day's rate from Frankfurter through the server, as the emulator harness reads
    every market-data service (SETUP.md); nothing is spent (index § 8 rule 5) and no assertion depends on the rate.

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
the pure module below. A new exported type carries an edit, where `null` REMOVES the field (JSON cannot carry an
explicit `undefined`, and an absent key means «keep»):

```ts
export type AssetTransactionUpdateData = Omit<Partial<AssetTransactionFormData>, 'feesNative' | 'settledTotalEur'> & {
  feesNative?: number | null;
  settledTotalEur?: number | null;
};
```

It replaces `Partial<AssetTransactionFormData>` in `prepareEdit`, `updateAssetTransaction` and
`assertBaselineEditableFields` (`lib/server/assetTransactionUseCase.ts`) and in the client's
`updateAssetTransaction` (`lib/services/assetTransactionService.ts`).

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
  /** The fee in the instrument's currency; 0 when there is none. */
  feesNative: number;
  /** A fee already in euro — a trade saved before 2026-11-23. Never together with a native one. */
  legacyFeesEur?: number;
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
  const legacyFee = input.legacyFeesEur ?? 0;
  if (input.settledTotalEur === undefined) {
    if (!input.ecb) throw new TradeFxError('no-rate');
    return {
      priceEur: input.pricePerUnit * input.ecb.rate,
      feesEur: legacyFee > 0 ? legacyFee : roundToCents(input.feesNative * input.ecb.rate),
      fxRate: input.ecb.rate,
      fxSource: input.ecb.isLatest ? 'ecb-latest' : 'ecb',
    };
  }
  if (input.quantity <= 0 || input.pricePerUnit <= 0) throw new TradeFxError('nothing-to-convert');
  // A euro fee is inside the statement's total (2026-11-23): what is left is what the titles moved.
  const convertedEur = input.type === 'buy' ? input.settledTotalEur - legacyFee : input.settledTotalEur + legacyFee;
  const native = nativeTotal(input);
  if (native <= 0 || convertedEur <= 0) throw new TradeFxError('nothing-to-convert');
  const fxRate = convertedEur / native;
  if (input.ecb && Math.abs(fxRate / input.ecb.rate - 1) > STATEMENT_RATE_TOLERANCE) {
    throw new TradeFxError('total-off', input.ecb.rate);
  }
  const feesEur = legacyFee > 0 ? legacyFee : roundToCents(input.feesNative * fxRate);
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
  the day's fixing (`fetchFrankfurterRateToEur`, `:45-62`) → `{ rate, isLatest }`; else the cached latest
  (`getExchangeRateToEur`) → `{ rate, isLatest: true }`; else null. It normalizes `GBp` like `:66-70`. On the
  answered fixing `isLatest` is `dayStr > todayStr`: a past day and today are the day's own rate (false); a FUTURE
  day is answered by Frankfurter's `latest` path (`:50`) and is true — DATI-07 stores a dividend announced for a
  future day as `'ecb-latest'` and converts it again at its payment day because of this. `resolveTradePriceEur`
  stays and is called for an EUR instrument only (it returns the price as it is); `resolveBaselinePriceEur`
  (`:118-135`, the migration) is not touched.
- `lib/server/validation.ts` (`:89-103`): the base schema gains `feesNative: z.number().finite().min(0).optional()`
  and `settledTotalEur: z.number().finite().positive().optional()`; the update schema (`:153-156`) extends both with
  `.nullable()` (null = remove the field; its inferred type is `AssetTransactionUpdateData`).
  `refineAssetTransaction` (`:106-148`) adds: on an adjustment neither is allowed («Una rettifica non prevede
  commissioni.» / «Una rettifica non movimenta liquidità.», the existing words); a `fees` greater than 0 together
  with a `feesNative` greater than 0 → «Indica la commissione in una sola valuta.». `settledTotalEur` together with
  `fees` is NOT refused: it is decision 61's case. The file also exports
  `fxRateQuerySchema = z.object({ currency: z.string().regex(/^[A-Za-z]{3}$/), date: isoDateSchema })` —
  `isoDateSchema` is private to the file and stays so.
- `lib/server/assetTransactionUseCase.ts`:
  - One private `resolveForeignTrade(currency, trade)`, where `trade` is `{ type, date, quantity, pricePerUnit,
    feesNative?, legacyFeesEur?, settledTotalEur? }` — the values of a create, or the MERGED values of an edit — and
    the answer is `{ priceEur, fees, feesNative?, settledTotalEur?, fxRate, fxSource }`:
    - a buy or a sale: `ecb = await resolveEcbRateToEur(currency, date)`, then `resolveTradeFx({ type, quantity,
      pricePerUnit, feesNative: feesNative ?? 0, legacyFeesEur, settledTotalEur, ecb })`; `fees` is the resolution's
      `feesEur` when it is greater than 0, else absent. `TradeFxError` maps: `no-rate` → the existing
      `TradeFxUnavailableError` (503), `total-off` → 422 with `describeTotalOff`, `nothing-to-convert` → 422 «Il
      totale in euro non si può convertire: controlla quantità, prezzo e commissione.».
    - an adjustment: no fee and no total; `ecb` null → `TradeFxUnavailableError`; `priceEur = pricePerUnit ×
      ecb.rate`, `fxRate = ecb.rate`, `fxSource` from `isLatest`.
  - `prepareCreate` (`:278`): for an EUR instrument, unchanged (`resolveTradePriceEur`), and `feesNative` or
    `settledTotalEur` present → `TradeUseCaseError(422, 'Commissione in valuta e totale in euro valgono solo per uno
    strumento in valuta.')`. For a non-EUR one the trade takes `resolveForeignTrade`'s answer, with `legacyFeesEur:
    data.fees` (a create that sends a euro fee on a foreign instrument — an older client — keeps it as it is).
  - `prepareEdit` (`:330`, the re-resolution at `:373-377`), on a non-EUR instrument. The merge, beside the existing
    ones: `mergedFeesNative` and `mergedSettledTotal` are `updates.x !== undefined ? updates.x ?? undefined :
    oldTrade.x` (null removes), both dropped on a merged adjustment; a native fee in the update replaces the euro
    one (`legacyFeesEur` is then undefined), otherwise `legacyFeesEur` is `mergedFees` when the merged native fee is
    absent. The rate is resolved again when a merged value of `pricePerUnit`, `date` (by `getTime()`), `quantity`,
    `type`, the native fee, the euro fee or the total DIFFERS from the stored trade's — the form sends every field
    at every save, so «is in the update» would resolve at each one; otherwise `priceEur`, `fees` and the four
    fields are the stored ones and no rate is read. A baseline's edit (quantity, price, note) converts its price
    with `resolveEcbRateToEur` at its own date, as `resolveTradePriceEur` did, and stores none of the four fields.
    `buildTradeUpdateDocData` (`:153`) writes the four fields or `FieldValue.delete()`, as it does for `fees`.
  - `assertCashSettlementAsset` (`:202-208`): also refuses `(data.currency ?? 'EUR').toUpperCase() !== 'EUR'` with
    `TradeUseCaseError(422, 'Il conto di regolamento deve essere in euro.')`. `prepareEdit` calls it only when the
    account CHANGES — `updates.linkedCashAssetId !== undefined && mergedLinkedCash && mergedLinkedCash !==
    oldTrade.linkedCashAssetId` (today: whenever the key is in the update, which the form always sends) — so a
    trade already settled on a foreign account is edited freely (decision 62). `assertSettlementAccountsStillCash`,
    the re-check inside the transaction, is NOT given the currency test: it cannot tell a kept account from a
    chosen one.
  - `TradeMutationResult` (`:80`) gains `priceEur: number` and `feesEur: number` (the trade's `priceEur` and
    `fees ?? 0`; a delete carries zeros), beside the `announcedDividends` DATI-04 added; `buildResult` fills them.
    `docToAssetTransaction` (`:104`) and `buildTradeSetDocData` (`:127`) map the four fields; so do the two other
    mappers of a trade document — `docToAssetTransaction` in `lib/services/assetTransactionService.ts` (what
    Movimenti and the form read) and the trade mapper of `lib/server/assetAdminRepository.ts` (what the server
    readers and DATI-15's tools read). `AssetTransactionMutationResult` (`lib/services/assetTransactionService.ts`)
    gains `priceEur: number` and `feesEur: number`.
- New route `app/api/fx/rate/route.ts`, `GET ?currency=USD&date=YYYY-MM-DD`: `requireFirebaseAuth`, the query parsed
  with `parseOr400(fxRateQuerySchema, …)`, answers `{ rate, isLatest }` from `resolveEcbRateToEur`, 503 when null.
  No account data: no `assertCanAccessAccount` (the demo and a co-owner read it like anyone signed in).

### 4.4 Client — the trade form (`components/assets/TransactionDialog.tsx`)

- `lib/hooks/useFxRate.ts`: `useFxRate(currency: string | undefined, isoDay: string | undefined)` → `useQuery` on
  `queryKeys.fx.rate(currency, isoDay)` (new key `fx: { rate: (currency: string, isoDay: string) => ['fx', 'rate',
  currency, isoDay] as const }`), `authenticatedFetch('/api/fx/rate?…')`, `staleTime` one hour, enabled only for a
  non-EUR instrument with a valid day.
- For a non-EUR instrument (not a baseline, not an adjustment) of any ledger type — a stock, an ETF, a crypto, a
  bond in a foreign currency alike: the fee field (`:735`) reads «Commissioni ({CUR})» and binds `feesNative` (it
  keeps today's `disabled` rule: no fee category set and no stored fee); a new field under it, «Totale addebitato in euro» on a buy / «Totale accreditato in euro»
  on a sale, optional, with the helper «Dall'estratto del broker, commissione inclusa. Se lo lasci vuoto uso il
  cambio BCE del giorno.» (sale: «Dall'estratto del broker, al netto della commissione e prima delle tasse
  trattenute. …»).
- The preview (`:364`, `:379`, `:834`) calls `resolveTradeFx` with the hook's rate: «Cambio BCE del
  {formatItalianDate(day)}: EUR/USD 1,0961 · totale stimato 814,56 €» (the date printed by the function
  `describeTradeFx` uses, so the two lines agree); with a euro total typed, «Cambio dal tuo totale: EUR/USD 1,0965»; a
  `total-off` shows `describeTotalOff` under the field and disables «Salva»; while the rate loads the line says
  «Leggo il cambio…», on a failed read «Cambio non disponibile: il totale si calcola al salvataggio.»
  `estimateTradePriceEur` (`:142-154`) is deleted.
- Editing a trade with `fees` and no `feesNative` (saved before 2026-11): the native field is empty and its helper
  reads «Commissione registrata in euro: {x} €. Resta così finché non la scrivi in {CUR}.»; left empty, the payload
  carries neither fee field; the helper of the total then reads «Dall'estratto del broker: comprende la commissione
  di {x} € già registrata.» and the preview passes `legacyFeesEur` (decision 61).
- **The edit payload.** A field the owner CLEARED is sent as `null` (`feesNative`, `settledTotalEur`); one left as
  it was is sent with its value; on an EUR instrument neither key is sent.
- `onCreated?.(result, formData, result.priceEur)` (`:515`): the third argument is the server's figure.
- The settlement-account list keeps only cash accounts whose currency is EUR. In an edit whose stored account is not
  among them, that account is added as a disabled-looking first option «{nome} (in {CUR}, non più selezionabile)»:
  it stays selected until the owner picks another, and once left it cannot be picked again (decision 62). A prefill
  (`prefill.linkedCashAssetId`, Accumulo's «Questo mese») that names a foreign account is ignored: the select
  starts on «Nessun conto».
- `components/assets/AssetMovementsDialog.tsx` has two layouts and the rate line goes in both, for a row that has
  `fxRate` and `fxSource`: in the table (`MovementTableRow`, from `sm:` up) inside the «Prezzo» cell, under the
  price, as `<span className="block text-[11px] text-muted-foreground">`; in the phone's row (`MovementRow`) as one
  line under the totals. The text is `describeTradeFx(asset.currency, fxRate, fxSource, date)`. In the phone's row
  «Commissioni {€}» becomes «Commissioni {feesNative} {CUR} ({fees} €)» when `feesNative` is present; the table has
  no fee column and gains none.
- `GBp`: on a legacy instrument whose currency is `GBp` the labels read «GBP» and the price is typed in pounds, as
  the server's conversion already assumes (`tradeFxService.ts:66-70`); `formatFxPair` prints GBP.

### 4.5 Accumulo

`buildRegisteredLinePatch` (`lib/utils/accumulationPlanUtils.ts:570-577`) is unchanged; its caller now receives the
server's `priceEur` through `onCreated`, so `executedAmountEur` is the real amount.

### 4.6 The instrument's currency and the cash accounts

- `lib/constants/currencies.ts` (new, written here — decision 59's ONE rule):

  ```ts
  /** The currencies an instrument or an amount may be chosen in: the ones Frankfurter quotes that the app lists. */
  export const INSTRUMENT_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'HKD', 'SGD', 'PLN'] as const;
  export type InstrumentCurrency = (typeof INSTRUMENT_CURRENCIES)[number];

  export function isListedCurrency(code: string): code is InstrumentCurrency {
    return (INSTRUMENT_CURRENCIES as readonly string[]).includes(code);
  }

  /** Pence are a unit of the pound, not a currency: the code becomes GBP and the amount is divided by 100. */
  export function normalizeCurrencyAmount(currency: string, amount: number): { currency: string; amount: number } {
    if (currency === 'GBp' || currency === 'GBX') return { currency: 'GBP', amount: amount / 100 };
    return { currency: currency.toUpperCase(), amount };
  }

  /**
   * May an amount be recorded in `currency`? A listed one always; another only when it is the own
   * currency of the instrument it belongs to (owner, 2026-11-23).
   */
  export function isCurrencyAllowed(currency: string, instrumentCurrency?: string): boolean {
    const code = normalizeCurrencyAmount(currency, 0).currency;
    if (isListedCurrency(code)) return true;
    return instrumentCurrency !== undefined && normalizeCurrencyAmount(instrumentCurrency, 0).currency === code;
  }
  ```

- `components/assets/AssetDialog.tsx`: the «Valuta *» input (`:2147-2152`) becomes a `Select` over
  `INSTRUMENT_CURRENCIES` plus the form's current value when it is not in the list (a legacy `GBp`, a currency a
  lookup found), rendered ABOVE the price fields of the same section and written with `setValue('currency', value,
  { shouldDirty: true })`; for `type === 'cash'` it is not rendered and the value is `'EUR'`. On a CREATE only, on
  blur of the ticker field of a ledger type, one silent quote lookup — the request `fetchMarketPrice` (`:148-187`)
  makes, without its two toasts (a `silent` option of that function) — sets `currency` from the quote when the
  owner has not changed the select (`dirtyFields.currency` false) and shows «Valuta rilevata: {CUR}» under it; the
  assignment at submit (`:1592`, `:1606`) stays as the net and never overwrites a currency the owner chose. Editing
  an instrument of a ledger type that has operations in the Registro (`asset.quantity !== 0`, or a trade of the
  asset in `useAssetTransactions`) the select is disabled, with the line «La valuta non cambia: le operazioni sono
  registrate in {CUR}.».
- `components/assets/CashAccountDialog.tsx`: for a cash account whose currency is not EUR, a warning line above the
  rows: «Conto in {CUR}: l'app lo conta come se fossero euro e non può regolare operazioni. Riscrivi il saldo in
  euro: salvando diventa un conto in euro.» Saving it through `AssetDialog` writes `currency: 'EUR'`.

### 4.7 One form for every purchase (decision 60)

- `components/assets/AssetDialog.tsx`, the create of a ledger type on an account that has the ledger
  (`ledgerCreateFlow`): the section «Posizione iniziale (primo acquisto)» is REMOVED — its quantity and purchase
  price inputs, `openingDate`, `openingCashAssetId`, `openingFees` (schema fields, defaults, the two resets, the
  labels map, `SettlementTimingNote` when nothing else uses it), `ledgerOpeningPrice` and the whole `firstBuy`
  block with its recovery toast. The branch saves what the `emptyCreateFlow` branch saves —
  `createAsset(ownerId, { ...formData, quantity: 0, averageCost: undefined, createdEmpty: true })` — invalidates
  `queryKeys.assets.all(ownerId)`, and then, when the `createEmpty` prop is NOT set: toasts «Strumento creato: ora
  registra il primo acquisto.», reads the stored instrument once (`getAssetById(savedAssetId)`,
  `lib/services/assetService.ts`), calls `onClose()` and hands it to `onRegisterTrade?.(created)`. The page
  (`app/dashboard/assets/page.tsx`, `handleRegisterTradeFromDialog`) already opens `TransactionDialog` on the asset
  it receives, on «Compra». With `createEmpty` (Accumulo's path and the model portfolio's tile) nothing changes:
  `onCreated(assetId)` and no trade form. The submit's label on that create reads «Crea e registra l'acquisto».
- The instrument closed without a purchase reads «Mai comprato» (`createdEmpty`, no ledger row): the chip the app
  already has, and DATI-05 keeps it in the list, deletable.
- A bond's first coupon and final premium are no longer scheduled at the create (quantity 0: DATI-04's guard): the
  first purchase schedules them (`scheduleCouponsForOpenedPosition` in `lib/services/couponScheduling.ts`, called by `TransactionDialog`). The bond's price basis — the
  quote in percent, the indexation coefficient — is the trade form's own (`resolveBondPrice`, `indexationCoefficient`).
- The classic create is untouched: a non-ledger type (an account, a property, a pension fund, a loan) and a ledger
  type on an account with no ledger yet (`metaNow == null`) still write quantity and average cost directly.
- `doc/guide/registro-operazioni.md` and `__tests__/dialogNarrative.test.ts` name the section's fields: § 9 and § 6.

## 5. Constraints and traps

- **`removeUndefinedDeep` / the optional-field-deletion trap** (AGENTS.md § Firestore Writes): here it means the four
  new fields are deleted, not written as `undefined`, when an edit clears them — through the path
  `buildTradeUpdateDocData` already has.
- **`runTransaction`: all reads before writes**: here it means the rate is resolved in `prepare*` (network), never
  inside `commitTradeMutation` — as `priceEur` is today.
- **`isoDateSchema` + `parseOr400`** (AGENTS.md § Server): the new route uses both, through `fxRateQuerySchema`.
- **Italian day**: the rate's day is the trade's Italian day (`formatItalyIsoDay`, `tradeFxService.ts:35-39`); the
  form sends the day it shows.
- **Cents** (`lib/utils/cents.ts`): the fee is rounded, the euro price is not (it is a unit price, as today); the
  cash delta is rounded once, by `computeCashDelta`.
- **A probe never opens a control that spends** — none here. **E1's assertions must not depend on Frankfurter's
  answer**: the server reads the day's rate for every foreign trade (it feeds the 25% guard), so E1 reaches the
  service by construction; it types a euro total that implies EUR/USD 1,0978 — inside the guard for any fixing
  between 0,88 and 1,37, and accepted when the service does not answer — and asserts on the stored trade and the
  account only. The ECB line of the preview is asserted in D1 with the hook mocked, never in E2E.
- **The fee field is disabled without a fee category** (`disabled={storedFee === null && !feeCategory}`): the base
  E2E account names none, so E1 plants one (§ 6).
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
| U6 | unit · same | decision 61: buy 10 × 50 USD, `legacyFeesEur` 5, total 460,00 € → rate 455/500, fee 5,00, `10 × priceEur + 5 = 460,00`; the same sale → `10 × priceEur − 5 = 460,00`; no total → price at the ECB rate and the fee still 5,00; a price of 0 with a total → `nothing-to-convert` | `convertedEur` = the total (the fee converted twice) |
| C1 | unit · `__tests__/currencies.test.ts` (new) | `normalizeCurrencyAmount('GBp', 4874)` = GBP 48,74; `'usd'` → USD; `isCurrencyAllowed('NZD')` false, `('NZD', 'NZD')` true, `('GBp')` true | drop the instrument's-own branch |
| F1 | unit · `__tests__/tradeFxService.test.ts` (new, `fetch` mocked by URL) | a past day → the day's path and `isLatest: false`; today → the `latest` path and `false`; a future day → the `latest` path and `true`; the day missing → the cached latest and `true`; both failing → null | return `isLatest: false` on the fallback; `>` → `>=` in the future test |
| T1 | unit · `__tests__/assetTransactionUseCase.fx.test.ts` (new) | create on a USD asset with fee and total: the stored doc has the six fields; the cash delta is −total; the fee plan receives the euro fee; the result carries `priceEur`, `feesEur`; a sale with total 900 and a withheld tax of 20 → the account moves by +880 | `fees: data.fees` kept for a native fee |
| T2 | unit · same | no total: `fxSource: 'ecb'`, `fxRate` the mocked rate | `fxSource` hard-coded |
| T3 | unit · same | total off → 422 with the sentence; an EUR asset with `feesNative` → 422 | skip the EUR guard |
| T4 | unit · same | an edit that sends every field unchanged but the note keeps the rate (no rate call); editing the quantity resolves again; `settledTotalEur: null` falls back to ECB and deletes the field; a trade with a euro fee of 5: quantity changed → the fee still 5 and the fee plan untouched; a total sent alone → decision 61's figures; `feesNative: 6` → the euro fee replaced by the converted one; an adjustment on a USD asset → `fxRate`, `fxSource`, no fee field; an edited baseline → none of the four fields | reuse the stored rate on a quantity change; drop `legacyFeesEur` from the edit's call |
| T5 | unit · same | a create settled on a USD cash account → 422 «…deve essere in euro.»; an edit that keeps a USD account and changes the note → accepted; an edit that moves to another USD account → 422 | drop the currency test; test the currency whenever the key is in the update |
| V1 | unit · `__tests__/serverValidation.test.ts` | an adjustment with `feesNative` or with `settledTotalEur` is refused; `fees` 3 with `feesNative` 4 is refused; `settledTotalEur` with `fees` passes; the update schema accepts `null` for both | drop one branch |
| R1 | unit · `__tests__/fxRateRoute.test.ts` (new) | 401 without a token; 400 on `currency=US`; 200 `{ rate, isLatest }`; 503 on null | skip `parseOr400` |
| D1 | dom · `__tests__/transactionDialog.fx.test.tsx` (new) | USD asset: the three labels; the ECB line with the mocked rate; a total typed → «Cambio dal tuo totale…»; a total 30% off → the refusal and «Salva» disabled; EUR asset: none of it | render the fields for EUR too |
| D2 | dom · `__tests__/assetMovementsDialog.fx.test.tsx` (new), both layouts | a trade with `fxSource: 'statement'` shows its line in the table's «Prezzo» cell and in the phone's row; one without `fxRate` shows none; the phone's row prints «Commissioni 5,00 USD (4,55 €)» | show the line unconditionally |
| D3 | dom · same file as D1 | `onCreated` receives the result's `priceEur` | pass the estimate |
| D4 | dom · `__tests__/assetDialog.currency.test.tsx` (new) | the currency is a combobox above the price; a lookup returning USD sets it with no toast; a lookup returning NZD adds NZD to the list; after the owner picked CHF neither the lookup nor the submit overwrites it; type `cash` → no combobox and a payload with `currency: 'EUR'`; an instrument with operations → the combobox disabled with its line | set on every lookup |
| D5 | dom · same file as D1 | a USD cash account is not in the settlement list; editing a trade settled on it shows «… (in USD, non più selezionabile)» selected | no filter |
| D6 | dom · `__tests__/cashAccountDialog.fx.test.tsx` (new) | a USD account shows the warning; a EUR one does not | show it for every account |
| D7 | dom · `__tests__/assetDialogCreateEmpty.test.tsx` (new block) | a new stock on an account with the ledger: no «Posizione iniziale» section, no quantity field; the submit calls `createAsset` with `quantity: 0, createdEmpty: true`, no trade mutation, and `onRegisterTrade` receives the created asset; with `createEmpty` → `onCreated` and no `onRegisterTrade` | keep the `firstBuy` call |
| E1 | e2e · `e2e/assets.fx.spec.ts` (new) | plants a euro account, a fee category named in `assetAllocationTargets/test-user-1` (`transferFeeCategoryId`, the document read first and restored in `afterAll`) and nothing else; creates a USD stock through «Nuovo asset» → the trade form opens by itself (decision 60); a buy of 10 at 50 with fee 5 and total 460,00 → the account's balance fell by exactly 460,00, Movimenti shows «dal totale dell'estratto» and the instrument is in Strumenti; removes the operation by the app and the rest by id, in a loop | `titlesEur` mutation of U1; keep AssetDialog's own first purchase (the trade form does not open) |

**The harnesses.** `__tests__/assetTransactionWriteTx.test.ts` and `__tests__/assetTransactionsRoutes.test.ts` mock
`@/lib/server/tradeFxService` with a factory that lists its exports: both gain `resolveEcbRateToEur: vi.fn(async () =>
({ rate: 1, isLatest: false }))`, and the test «writes a EUR-side averageCostEur distinct from the native averageCost
for a foreign-currency buy» is rewritten on `resolveEcbRateToEur → { rate: 0.9, isLatest: false }` (price 100 →
`priceEur` 90). F1: `vi.mock('server-only', () => ({}))`; the rate cache of `currencyConversionService` lives for the
whole file, so each test resets the modules and imports the service dynamically. D1 mocks `useSettings` and
`useExpenseCategories` with one fee category (the fee field is disabled without). `__tests__/dialogNarrative.test.ts`
names `openingDate` among the asset form's labels: the entry leaves with the field.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: buying 10 units at 50,00 USD with a 5,00 USD fee and «Totale addebitato in euro»
460,00 takes exactly 460,00 € from the chosen account, files a fee row of 4,55 € in Cashflow, and Movimenti reads
«EUR/USD 1,0978 · dal totale dell'estratto»; the same purchase with the total left empty reads «BCE del {giorno}».

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390, with a fee category planted
  as in E1 (the network is read by the preview, by the server's resolution of every foreign trade and by the ticker
  lookup; what they answer is observed, not asserted): B a new USD instrument from «Nuovo asset» → the trade form
  opens, the buy with a total; C the buy without; D a total with a slipped decimal (46,00) → refused; a sale with a
  withheld tax; an edit of the quantity; clearing the total; a trade planted with a euro fee and a total typed on it
  → the account moves by the total; E a USD cash account planted («ornitorinco») → absent from the list, its dialog
  shows the warning; a trade planted on it, edited in its note → saved, its account shown «non più selezionabile»;
  the currency select on a new instrument; a new EUR bond created and bought → its next coupon appears in Dividendi.
- F — at the owner's «pronto», on the mirror: one real order copied from his broker's statement.

## 8. Putting it into service

No rules change (the trade documents are server-written), no index. Existing trades are untouched: they have no
`fxRate`, so Movimenti shows no rate line for them. Measure: `perf:budget` on `/dashboard/assets` and
`/dashboard/allocation` (stop above +1 KB on either). With phase F closed and the commit in `develop`, the owner opens
the PR `develop` → `main` (index § 8 rule 13); the checks on the production account follow that merge.

## 9. Documentation

- `doc/guide/registro-operazioni.md` — new § «A trade in a foreign currency» (the two inputs, the derivation, the
  three sources, the guard, the edit rule and its merge, a legacy euro fee inside the total, the account kept by an
  old trade); the passages on FX (the conversion at the trade's day, the silent fallback) rewritten; the passage on
  the first purchase from the asset form REWRITTEN to decision 60 (one form, the instrument created empty); § blind
  spots: the line «BCE del {giorno}» on a weekend, a holiday or today before the fixing carries the previous
  fixing; an edited opening position shows no rate.
- `doc/guide/patrimonio-strumenti.md` (the guide DATI-05 split from `patrimonio.md`) — the currency select, the
  locked currency of an instrument with operations, the create that hands over to the trade form;
  `doc/guide/patrimonio.md` — the euro-only cash accounts; § Per-page blind spots: a hand-typed price on a foreign
  instrument leaves `currentPriceEur` as it was until the next quote; a migration baseline converts at today's
  ratio; `GBp` is a legacy value typed in pounds; the other account pickers (Cashflow) still list a foreign cash
  account.
- `doc/guide/server.md` — the new route.
- `README.md` — the two feature lines on operations that say prices are converted at the ECB rate gain the
  statement's total (the line on multi-currency DIVIDENDS is DATI-07's).
- `AGENTS.md` § 3, the stub «Asset Trade Ledger» — rewritten at equal or shorter length with the rule and the date
  (decision 47). `CLAUDE.md` — the Registro operazioni line rewritten at equal or shorter length with «a foreign
  trade keeps its rate and takes the statement's euro total»; the «Latest» entry REPLACED whole (decision 46: the
  date, this spec in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-07»); under 20.000 characters,
  counted with `node`.
- `Draft Release Temp.md` — two entries prepended in `## ✨ New Features`, in the file's form: «**Patrimonio —
  operazioni in valuta** — Added to «Registra operazione» on a foreign instrument: the fee in the instrument's
  currency, «Totale addebitato in euro» from the broker's statement, and the rate each operation used, shown in
  «Movimenti».» and «**Patrimonio — un solo modulo per gli acquisti** — Changed «Nuovo asset»: a new instrument is
  created empty and «Registra operazione» opens for its first purchase; the currency is a list, and cash accounts are
  in euro only.»
- `doc/dati/README.md` § 6 and § 7 (C2 as built).

## 10. Declared out of scope

- Dividends in a foreign currency → DATI-07.
- The Assistente recording a foreign trade → DATI-16 (it uses C2 as is).
- A cash account truly held in a foreign currency (valued at the day's rate, moving dollars) → not planned
  (decision 6).
- `currentPriceEur` after a hand-typed price; the baseline's rate; `GBp` → doc/guide/patrimonio.md § Per-page blind
  spots.
- The other account pickers excluding a foreign cash account → doc/guide/patrimonio.md § Per-page blind spots.
- Accrued interest on a bond's purchase → DATI-18; the lot warning → DATI-20; the premium line → DATI-21: each adds
  to the ONE trade form this spec leaves.

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
- Leggi doc/guide/registro-operazioni.md, doc/guide/patrimonio.md, doc/guide/patrimonio-strumenti.md,
  doc/guide/server.md, doc/guide/dialog.md, doc/guide/accumulo.md, doc/guide/e2e-playwright.md e
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

Implementa la spec così com'è scritta, nell'ordine: i due moduli puri con U1–U6 e C1, il servizio del
cambio (F1), lo schema (V1) e il caso d'uso (T1–T5, dopo aver aggiornato i due mock di tradeFxService
descritti nel § 6), i tre mapper di un'operazione e il tipo della risposta in
lib/services/assetTransactionService.ts, la route del cambio (R1), la finestra dell'operazione e
Movimenti (D1–D3, D5), la valuta dello strumento e i conti (D4, D6), il modulo unico degli acquisti
(§ 4.7, D7), poi E1 sugli emulatori, i documenti del § 9 e la riga 06 di doc/dati/README.md § 6 a
`implemented` (e C2 nel § 7 com'è costruito). OGNI test del § 6 va visto rosso con la sua mutazione. Il
codice dei § 4.2 e § 4.6 è già scritto: copialo.

Fermati e chiedimi se: prepareCreate, prepareEdit, assertCashSettlementAsset o buildTradeUpdateDocData
non sono più quelli che descrive il § 4.3 (la risposta dell'operazione porta già `announcedDividends` di
DATI-04: è attesa), il totale dell'estratto non coincide al centesimo con il movimento del conto in un
caso che il § 4.2 non prevede, oppure un'asserzione di E1 dipende dal valore del cambio letto dalla rete.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec on the trade ledger's money path that defines a shared contract.
Estimated size: L (four new modules, one route, the schema, the use case, three mappers, four dialogs; 26 tests).
