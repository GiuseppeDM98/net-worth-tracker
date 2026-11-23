# DATI-07 — A dividend in a foreign currency: the instrument's currency, two withholdings, the rate of the payment day

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-04 (the entitlement verdict it extends) and
> DATI-06 (contract C2: `resolveEcbRateToEur`, `TradeFxSource`, `formatFxPair`, `INSTRUMENT_CURRENCIES`, `useFxRate`).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 2; decision 7.

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
   `INSTRUMENT_CURRENCIES`. Proof: D1.
2. Every amount label carries the record's currency. Proof: D1.
3. For a currency other than EUR the form has two per-unit withholdings — «Ritenuta estera per unità ({CUR})» and
   «Ritenuta italiana per unità ({CUR})» — the second proposed at the instrument's rate on gross minus the first; the
   first proposed at the rate of the instrument's last dividend, else 15% when the ISIN starts with `US`, else 0. For
   EUR the form keeps its single withholding. Proof: U1, U2, D2.
4. The record stores `foreignTaxAmount` beside `taxAmount`, which stays the TOTAL tax (every reader of `taxAmount`
   and `netAmount` is unchanged). Proof: U1, S1.
5. A foreign dividend is converted at the ECB rate of its PAYMENT day; with «Netto accreditato in euro» typed, the
   euro net is exactly that figure and the rate is the one it implies. `exchangeRate` and `fxSource` are stored and
   shown. Proof: U3, U4, S1, D3.
6. A dividend announced for a future day is converted at the latest rate (`fxSource: 'ecb-latest'`) and converted
   again at the payment day's rate by the payment-day cron, before the income is created. Proof: P1.
7. The income row's amount equals the record's euro net. Proof: P1 (the row built from the re-converted record).
8. A pending record recomputed by a trade (DATI-04) scales its foreign tax with the rest. Proof: U5.
9. A euro net more than 25% away from the payment day's ECB rate is refused (the guard of C2). Proof: U4, S2.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green.

## 3. Decisions

- **Decision 7** (owner, 2026-11-23): everything — the currency from the instrument, the right labels, the payment
  day's rate or the euro actually credited, and two distinct withholdings (foreign, Italian on the frontier net).
- Adopted, reversible:
  - (a) the form stays per unit (gross, foreign withholding, Italian withholding), as it is today; the totals are
    derived.
  - (b) `taxAmount` remains the total and `foreignTaxAmount` is its foreign part: no reader of the stats, the tiles or
    the email changes.
  - (c) the foreign rate proposed is a starting point the owner edits (treaty rates differ by country and by broker);
    it is remembered per instrument through its last record, not through a new field on the asset.
  - (d) an automatic (scraped) dividend keeps a foreign withholding of 0 and the Italian rate of the instrument — the
    amounts of today; only its conversion day changes.
  - (e) the euro tax is the difference between the euro gross and the euro net, so the three euro figures add up.

## 4. Solution

### 4.1 Types and schema

`types/dividend.ts` — `Dividend` and `DividendFormData` gain `foreignTaxAmount?: number` (in the record's currency,
part of `taxAmount`) and `settledNetEur?: number` (the euro credited, from the statement); `Dividend` also
`foreignTaxAmountEur?: number` and `fxSource?: TradeFxSource`. `exchangeRate` keeps its meaning (`:43`).

`lib/server/validation.ts` `dividendDataSchema` (`:46`): `foreignTaxAmount: z.number().finite().min(0).optional()`,
`settledNetEur: z.number().finite().positive().optional()`.

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

/** The foreign rate a new record proposes: the instrument's last one, else the US treaty rate, else none. */
export function proposeForeignTaxRate(isin: string | undefined, lastForeignRate: number | undefined): number {
  if (lastForeignRate !== undefined) return lastForeignRate;
  return isin?.toUpperCase().startsWith('US') ? US_TREATY_RATE : 0;
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
  - `createDividend` (`:174`): the conversion block (`:203-225`) is replaced by `resolveDividendFx({ grossAmount,
    netAmount, foreignTaxAmount: data.foreignTaxAmount ?? 0, settledNetEur: data.settledNetEur, ecb: await
    resolveEcbRateToEur(currency, paymentDate) })`. `no-rate` keeps today's graceful path (the record is saved with no
    euro fields, logged); `total-off` and `nothing-to-convert` are thrown as a 422 the routes return with
    `describeTotalOff`. The document stores the six results plus `foreignTaxAmount` and `settledNetEur`.
  - `updateDividend` (`:288`): the same resolution whenever the update carries `currency`, any amount, `paymentDate`
    or `settledNetEur` — reading the stored record first for the fields the update omits; an EUR currency clears the
    six euro fields and `foreignTaxAmount` stays as sent.
  - new `reconvertAtPaymentDay(dividend: Dividend): Promise<Dividend>`: for a non-EUR record with no `settledNetEur`
    and `fxSource !== 'ecb'`, resolves again with the payment day's rate and writes the euro fields; returns the
    updated record.
- `lib/server/dividendProcessor.ts`:
  - `runExpenseCreation` (`:200`): after the entitlement verdict of DATI-04 and before the income is built, `dividend
    = await reconvertAtPaymentDay(dividend)`.
  - `runDividendScraping` (`:144-145`) and the scrape route (`app/api/dividends/scrape/route.ts:161-163`): the tax is
    `computeDividendTaxes(gross, 0, asset.taxRate && asset.taxRate > 0 ? asset.taxRate : 26)` — the same figures as
    today for a 26% instrument, the instrument's own rate otherwise.
- `lib/utils/dividendEntitlement.ts` (DATI-04): `AnnouncedDividend` picks `foreignTaxAmount` too and the `update`
  verdict gains `foreignTaxAmount: number | undefined` — `dividend.foreignTaxAmount === undefined ? undefined :
  grossAmount * (dividend.foreignTaxAmount / dividend.grossAmount)`; `reconcileAnnouncedDividendsForAsset` passes it
  to `updateDividend`.

### 4.4 Client — `components/dividends/DividendDialog.tsx`

- Choosing an instrument on a new record (`:214-…`, the effect that fills the units) also sets `currency` to the
  instrument's (`GBp` → `GBP`) while the owner has not touched the select; the select (`:605-617`) maps
  `INSTRUMENT_CURRENCIES`.
- The labels at `:438` and `:455` take `({currency})` — «(€)» for EUR.
- For a non-EUR currency: a new field «Ritenuta estera per unità ({CUR}) *» before the existing one, renamed
  «Ritenuta italiana per unità ({CUR}) *». Proposals for a NEW record and untouched fields only (the rule of
  `:207-212`): foreign = `gross × proposeForeignTaxRate(asset.isin, lastForeignRate) / 100`, Italian =
  `(gross − foreign) × proposedRate / 100`, each showing «proposta al {x}%». `lastForeignRate` is `foreignRateOf` of
  the instrument's most recent record among the dividends the dialog already receives. On an edit of a record with no
  `foreignTaxAmount` the foreign field shows 0 and the Italian one the saved total.
- A new optional field «Netto accreditato in euro» with the helper «Dall'estratto del conto. Se lo lasci vuoto uso
  il cambio BCE del giorno di pagamento.»; under it the preview from `useFxRate(currency, paymentDay)` (C2):
  «Cambio BCE del {dd/mm/yyyy}: EUR/USD 1,0961 · netto stimato 40,05 €», or «Cambio dal tuo accredito: EUR/USD
  1,0965»; a payment day in the future reads «Cambio di oggi: quello del giorno di pagamento lo applico quando
  arriva.»
- The submit (`:308-311`) sends `taxAmount = (foreign + italian) × units`, `foreignTaxAmount = foreign × units`
  (omitted for EUR), `settledNetEur` when typed.
- `components/dividends/DividendRecordDetailsDialog.tsx`: for a foreign record, two rows «Ritenuta estera» and
  «Ritenuta italiana» in place of the single one when `foreignTaxAmount` is present, and one line
  `describeTradeFx(currency, exchangeRate, fxSource, paymentDate)` when `fxSource` is.

## 5. Constraints and traps

- **`taxAmount` is read by the stats route, the tiles, the email and the PDF**: here it means it stays the total —
  S1 asserts `taxAmount = foreign + italian` on the stored document.
- **`updateDividend`'s `expenseId` sentinel** (`dividendService.ts:347-350`): untouched; the new fields are plain
  optional numbers cleaned by `removeUndefinedFields`.
- **`readCreditableAccount` refuses an account of another currency** (`dividendIncomeService.ts:73-74`): the row of a
  converted dividend is in euro, so the euro account passes — P1 keeps a euro account.
- **Italian day**: the rate's day is the payment date's Italian day (the service of C2 does it).
- **No call to Frankfurter in E2E assertions** (the rule of DATI-06): E1 types a euro net.
- **Invented figures**: 10 units, 0,50 USD gross a unit, 15% and 26%, net credited 2,88 €.
- **A series label never enters the code.**

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/dividendFx.test.ts` | gross 100, 15% and 26% → foreign 15, Italian 22,10, tax 37,10, net 62,90 | Italian on the gross |
| U2 | unit · same | proposal: last rate 10 → 10; ISIN `US…` → 15; ISIN `IE…` → 0; `foreignRateOf` on a record without the field → undefined | drop the ISIN branch |
| U3 | unit · same | ECB 0,90 → euro gross 90,00, net 56,61, tax 33,39 (the difference), `'ecb'`; latest → `'ecb-latest'` | tax = `taxAmount × rate` rounded on its own (a 0,01 drift case) |
| U4 | unit · same | credited 57,00 on a net of 62,90 → rate 57/62,9, euro net exactly 57,00, `'statement'`; 30% off → `total-off` | net recomputed from the rate |
| U5 | unit · `__tests__/dividendEntitlement.test.ts` | a record with a foreign part, quantity halved → `foreignTaxAmount` halved; one without → undefined | always 0 |
| S1 | unit · `__tests__/dividendUseCase.test.ts` | `createDividend` in USD with both withholdings: the document has `taxAmount` = their sum, `foreignTaxAmount`, the euro fields, `fxSource`; the rate asked is the PAYMENT day's | pass the ex-date |
| S2 | unit · same | a credited euro net 30% off → 422 with the sentence; `no-rate` → saved without euro fields | swallow `total-off` |
| P1 | unit · `__tests__/dividendProcessor.test.ts` | a record saved at `'ecb-latest'` 0,90; on its payment day the rate is 0,95 → the record's euro net and the income row are at 0,95; a record with `settledNetEur` is not converted again | skip `reconvertAtPaymentDay` |
| D1 | dom · `__tests__/dividendDialog.fx.test.tsx` (new) | picking a USD instrument sets «USD» and the labels read «(USD)»; after the owner picks CHF, picking another instrument does not overwrite | set on every pick |
| D2 | dom · same | USD: two withholding fields with their proposals; EUR: one | render both for EUR |
| D3 | dom · same | the preview line with the mocked rate; a typed credit → «Cambio dal tuo accredito…»; a future payment day → the third sentence | one sentence for all |
| E1 | e2e · `e2e/cashflow.dividendi.spec.ts` | a USD instrument planted; a dividend entered with both withholdings and «Netto accreditato in euro» 2,88, paid today → the income row in Tracciamento is 2,88 € and the details dialog shows the two withholdings and «dal totale dell'estratto» | euro net recomputed from the rate |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: a dividend of 0,50 USD on 10 units of a US stock proposes 15% abroad and 26% in
Italy, shows a net of 3,15 USD (5,00 − 0,75 − 1,11 — the Italian tax on 4,25), and with «Netto accreditato in euro»
2,88 files an income of exactly 2,88 € on the day it is paid.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390: B the new record on a USD
  instrument; C the same without the credited euro (the rate line observed, not asserted); D an EUR instrument (one
  withholding, «(€)»); an edit of a record saved before this spec (no foreign part); E a future payment day, then the
  payment-day function run by hand against the emulator (`runExpenseCreation` through its route with the cron secret)
  → re-converted. Decoys «ornitorinco», «fenicottero».
- F — at the owner's «pronto», on the mirror: one real foreign dividend from his statement.

## 8. Putting it into service

No rules change (dividends are written by the routes), no index. Existing records are untouched; an existing foreign
record without `fxSource` shows no rate line and is converted again only if edited.

## 9. Documentation

- `doc/guide/cashflow-dividendi.md` — new § «A dividend in a foreign currency» (the two withholdings and where each
  is stored, the three sources of the rate, the re-conversion on the payment day, the proposal rule); § blind spots:
  the foreign rate is a proposal, not a treaty table; a scraped dividend never has a foreign part.
- `doc/guide/registro-operazioni.md` § «A trade in a foreign currency» — a pointer: dividends reuse the rate service
  and the guard.
- `README.md` — the dividend feature line gains the foreign withholding.
- `AGENTS.md` § 3, Dividendi stub — one sentence. `Draft Release Temp.md` — «Dividendi in valuta: valuta dello
  strumento, ritenuta estera e italiana, cambio del giorno di pagamento o netto accreditato».
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- A table of treaty rates by country → not planned; the proposal is editable (doc/guide/cashflow-dividendi.md
  § blind spots).
- The foreign tax credit in a tax-return view → not planned; the amount is now recorded.
- Coupons of foreign-currency bonds scheduled automatically → they follow the same conversion (payment day), no
  foreign part; nothing else changes.
- The Assistente recording a dividend → not in this series (CLAUDE.md § Current Status names it if opened).

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
  currency), doc/guide/server.md, doc/guide/dialog.md e doc/guide/e2e-playwright.md PRIMA di scrivere
  codice in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: il modulo puro con U1–U4 (ognuno visto rosso con
la sua mutazione), l'estensione del verdetto (U5), il servizio dei dividendi e lo schema (S1, S2), il
giorno di pagamento e lo scrape (P1), la finestra e il dettaglio (D1–D3), poi E1 sugli emulatori. Il
codice del § 4.2 è già scritto: copialo.

Fermati e chiedimi se: il contratto C2 in develop non è quello dell'indice (nomi o firme diversi), un
lettore di `taxAmount` cambia cifra, oppure E1 dipende dalla rete.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec on a money path (the income row, a cron) built on a shared
contract. Estimated size: M (one new module, five touched, ~12 tests).
