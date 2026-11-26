# DATI-16 — Assistente › Registra: a purchase or a sale told in words, and the instrument created with it

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-08 (contract C4: the question card,
> Registra's own protocol, the fake stream's reply), DATI-06 (contract C2: the foreign-currency trade fields,
> `tradeFx`, `useFxRate`, the currency rule of `lib/constants/currencies.ts`, the ONE purchase form) and DATI-04
> (the trade's `announcedDividends`). Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a line number
> is a hint, the function's name is the anchor). Owner's point 6; decisions 23, 29, 59, 60 and 85.

## 1. The problem today (evidence on the code)

The owner wants to tell the Assistente «ho comprato 10 azioni di X a 180 dollari» and have the instrument created
and the trade recorded. Today:

- Registra proposes cashflow rows only: one block language (`EXPENSE_PROPOSAL_LANGUAGE = 'expense-proposal'`,
  `lib/utils/expenseProposal.ts:38`), four kinds (`expense | income | transfer | debt`, `:57-59`), a card that writes
  through the expense form's path (`writeExpenseProposal`, `components/assistant/ExpenseProposalCard.tsx:131-150`).
- Registra's contract speaks of the Cashflow alone (`REGISTER_CONTRACT`, `lib/server/assistant/prompts.ts:1177-1218`)
  and its data block lists categories, accounts, loans, properties, centres, members — no instrument
  (`formatRegisterContextForPrompt`, `lib/utils/assistantRegisterContext.ts:448-516`).
- The router sends to Registra «una spesa, un'entrata, uno spostamento tra conti, una rata pagata»
  (`lib/server/assistant/router.ts:55-57`): a purchase of securities is read as chat.
- The writes exist and are the forms': an instrument is `createAsset(userId, AssetFormData)`
  (`lib/services/assetService.ts:130-207`); a ledger instrument opens EMPTY and its first buy opens the position
  (`components/assets/AssetDialog.tsx:1667-1691`); a trade is `createAssetTransaction(ownerId, data)` → POST
  `/api/asset-transactions` (`lib/services/assetTransactionService.ts:141-151`), which answers with
  `{ transactionId, derived, realizedPnlEur?, feeRow? }` (`:36-42`). A ticker is checked by
  `GET /api/prices/quote?ticker=` (`app/api/prices/quote/route.ts:29-71`: `price`, `currency`, `currentPriceEur?`).
- The outcome of a card is saved under a closed key (`^(expense|goal|question):\d+$`,
  `lib/server/validation.ts:223-237`; `proposalKey`, `expenseProposal.ts:128`).

## 2. Goal and acceptance criteria

1. A message that tells a purchase or a sale of a share, an ETF, a crypto, a commodity or a bond is read as a
   registration. Proof: R1.
2. The model proposes it as a `trade-proposal` block; the app shows ONE card with the instrument, the operation,
   the day, quantity × price, the fee, the account and the total; nothing is written before «Conferma». Proof: S1,
   D1.
3. An instrument the account does not hold yet is created by the same «Conferma», then the purchase is recorded;
   its ticker is checked against the quote service when the card appears, and a ticker that does not quote cannot be
   confirmed. An instrument already held under that ticker, display ticker or ISIN is the held one. Proof: S2, D2,
   D3.
4. An instrument in another currency follows C2: the price and the fee in its currency, the euro total when the
   user gave it, else the ECB rate of the day; the card shows the rate and where it comes from. Proof: S3, D4.
5. A price said in another currency than the instrument's STOPS the card: «Lo strumento è quotato in {CUR}: il
   prezzo che hai scritto è in {CUR2}. Correggi il prezzo.», with a price field on the card, and «Conferma» off
   until the price is corrected there. Pence are pounds with the amount ÷ 100; a NEW instrument quoted in a
   currency outside the app's thirteen is refused with one line. Proof: S5, D9.
6. If the instrument was created and the purchase then failed, the card says so and «Riprova» records only the
   purchase. Proof: D5.
7. A sale names an instrument held; a sale of more than is held is refused on the card before any write. Proof: S4.
8. A bond — one held or a new one — is completed in the app's ONE purchase form, opened from the card with what
   the user said already in its fields; the card closes as written when the form saves. Proof: D6, D6b.
9. The outcome is saved on the message (`trade:N`) and survives a reload; a written card links to Patrimonio.
   Proof: D7, V1.
10. With the ledger not initialised the model proposes nothing and says where it starts. Proof: X2.
11. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1–E3 green
    (fake SSE: no model is called); `npm run perf:budget` green with `/dashboard/assistant` inside its ceiling,
    raised by no more than 1 KB gz and only with the register row (index § 8 rule 7).

## 3. Decisions

- **Decision 23** (owner, 2026-11-23, in his words): «Io farei tutti i tipi, e ovviamente in base al tipo fa le
  domande giuste» — this spec covers the ledger types; DATI-17 the others.
- **Decision 29** (owner, 2026-11-23): one card, «crea e registra».
- **Decision 59** (owner, 2026-11-23): ONE currency rule — pence are pounds ÷ 100; a currency outside the thirteen
  is allowed only as the own currency of an instrument already held; a NEW instrument in such a currency is
  refused from the chat with one line («aggiungilo da Patrimonio»). The functions are DATI-06's
  (`normalizeCurrencyAmount`, `isListedCurrency`, `lib/constants/currencies.ts`).
- **Decision 60** (owner, 2026-11-23): ONE form for every purchase. A bond told in the chat meets that form:
  `AssetDialog` creates a new bond empty and hands it to `TransactionDialog`; the card prefills both.
- **Decision 85** (owner, 2026-11-23): the instrument's currency differs from the one the price was said in →
  the card stops with its line and «Conferma» stays off until the price is corrected on the card.
- Standing rule of Registra (2026-11): a row is proposed as a card and written by the browser on «Conferma», once.
- Adopted, reversible:
  - (a) a new block language, `trade-proposal`, beside `expense-proposal`: the two schemas share no field worth a
    union. At most 3 per message; never mixed with the other block kinds.
  - (b) a new instrument from the chat needs a ticker that quotes; a hand-priced instrument is created from
    Patrimonio (the answer says so).
  - (c) a bond goes through the form: its price is a quote in percent of par scaled by the nominal and, for a
    BTP€i, a coefficient (`lib/utils/bondPricing.ts:1-22`) and a new bond has a coupon schedule — one rule, the
    form's. On the card a bond shows its nominal and its quote and NO total.
  - (d) the new instrument takes the form's defaults: class from its type, liquid, price updated automatically,
    no tax rate set, `createdEmpty: true` as the form's own create writes it — if the purchase then fails it reads
    «Mai comprato» in Patrimonio.
  - (e) an `adjustment` is not proposed from the chat.
  - (f) a trade moves its account by itself (`linkedCashAssetId`): no cashflow row is proposed for it.
  - (g) the new instrument's type is the model's and its class comes from ONE table, `LEDGER_TYPE_CLASS`, which
    DATI-19 reads too.
  - (h) after a corrected price the fee stays as the model wrote it, in the instrument's currency: the card shows
    it with its currency, and «Ignora» is the way out.

## 4. Solution

### 4.1 The proposal — `lib/utils/tradeProposal.ts` (new, written here)

```ts
/**
 * A purchase or a sale told to the Assistente (2026-11-23): the block the model writes, and its
 * resolution against what the account holds. Pure — the instruments, the accounts and the quote
 * come in; the card writes.
 */
import { z } from 'zod';
import type { Asset, AssetClass, AssetFormData, AssetType } from '@/types/assets';
import type { AssetTransactionFormData } from '@/types/assetTransactions';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { isListedCurrency, normalizeCurrencyAmount } from '@/lib/constants/currencies';
import { roundToCents } from '@/lib/utils/cents';
import { isCalendarDate } from '@/lib/utils/expenseProposal';
import { nativeTotal } from '@/lib/utils/tradeFx';

export const TRADE_PROPOSAL_LANGUAGE = 'trade-proposal';
export const TRADE_PROPOSALS_MAX_PER_MESSAGE = 3;

export const NEW_INSTRUMENT_TYPES = ['stock', 'etf', 'crypto', 'commodity', 'bond'] as const;

// Any three letters: an unlisted or a mistyped currency is the card's to refuse, not a block printed as code.
const currencyCode = z.string().trim().length(3);

export const tradeProposalSchema = z
  .object({
    kind: z.enum(['buy', 'sell']),
    // An [id] of the STRUMENTI block, or a new instrument — never both.
    assetId: z.string().min(1).optional(),
    newInstrument: z
      .object({
        type: z.enum(NEW_INSTRUMENT_TYPES),
        ticker: z.string().trim().min(1).max(20),
        name: z.string().trim().min(1).max(80),
        // What the model believes the ticker quotes in; the quote decides.
        currency: currencyCode,
        // A malformed ISIN is dropped, not a reason to lose the proposal.
        isin: z.string().trim().toUpperCase().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/).optional().catch(undefined),
      })
      .optional(),
    dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate),
    // A bond: the nominal in euro.
    quantity: z.number().positive().max(1_000_000_000),
    // Per unit, as the user said it. A bond: the quote in percent of par.
    pricePerUnit: z.number().positive().max(100_000_000),
    // The currency the user said the price in, when it is not the instrument's («a 180 euro» on a USD share).
    priceCurrency: currencyCode.optional(),
    // In the instrument's currency; 0 = no fee.
    fees: z.number().min(0).max(1_000_000).optional(),
    // Another currency only: what the statement debited (buy, fee included) or credited (sell, net of the fee).
    settledTotalEur: z.number().positive().max(1_000_000_000).optional(),
    accountId: z.string().min(1).optional(),
    withheldTaxEur: z.number().min(0).max(100_000_000).optional(),
    note: z.string().max(200).optional(),
    reason: z.string().min(1).max(240),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (Boolean(p.assetId) === Boolean(p.newInstrument)) issue('exactly one of assetId and newInstrument');
    if (p.kind === 'sell' && p.newInstrument) issue('a sale names an instrument held');
    if (p.kind === 'buy' && p.withheldTaxEur !== undefined) issue('only a sale withholds tax');
  });

export type TradeProposal = z.infer<typeof tradeProposalSchema>;

export function parseTradeProposal(raw: string): TradeProposal | null {
  try {
    const parsed = tradeProposalSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The class a new instrument takes from its type (the asset form's `TYPE_TO_CLASS`, for the ledger types). */
export const LEDGER_TYPE_CLASS: Record<(typeof NEW_INSTRUMENT_TYPES)[number], AssetClass> = {
  stock: 'equity',
  etf: 'equity',
  crypto: 'crypto',
  commodity: 'commodity',
  bond: 'bonds',
};

export const TRADE_TYPE_LABELS: Record<(typeof NEW_INSTRUMENT_TYPES)[number], string> = {
  stock: 'Azione',
  etf: 'ETF',
  crypto: 'Criptovaluta',
  commodity: 'Materia prima',
  bond: 'Obbligazione',
};

export interface TradeProposalRefs {
  /** Every instrument of the ledger types, the zeroed ones included. */
  instruments: Asset[];
  cashAssets: Asset[];
  /** The trade ledger was initialised; null until its meta has answered. */
  ledgerReady: boolean | null;
}

/** What the quote service said of a new instrument's ticker. */
export type TickerQuote =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'found'; price: number; currency: string; priceEur?: number };

export const TRADE_PROBLEM = {
  unknownInstrument: 'Strumento non trovato: è stato eliminato o rinominato',
  notLedger: 'Questo strumento non si muove con le operazioni',
  unknownAccount: 'Conto non trovato',
  foreignAccount: 'Il conto di regolamento deve essere in euro',
  futureDate: 'Una operazione non può avere una data futura',
  ledgerOff: 'Il registro operazioni non è ancora attivo: apri Patrimonio, si avvia da solo',
  oversell: (held: number) => `Ne possiedi ${held.toLocaleString('it-IT', { maximumFractionDigits: 8 })}: non puoi venderne di più`,
  tickerMissing: 'Il ticker non ha una quotazione: controlla il simbolo',
  currencyMismatch: (instrument: string, said: string) =>
    `Lo strumento è quotato in ${instrument}: il prezzo che hai scritto è in ${said}. Correggi il prezzo.`,
  unlistedCurrency: (currency: string) => `Uno strumento in ${currency} non si crea dalla chat: aggiungilo da Patrimonio`,
  feeOverTotal: 'La commissione supera il controvalore della vendita',
  duplicate: (name: string) => `Hai già «${name}»: l'operazione va su quello`,
  totalOnEuro: 'ignorato: totale in euro (lo strumento è in euro)',
} as const;

/** Shown while the card waits (the ticker check, the ledger's meta): no red line, «Conferma» off. */
export const TRADE_WAIT_LINE = 'Controllo il ticker…';

export interface ResolvedTradeProposal {
  /** `'form'`: a bond — the app's own form completes it. */
  route: 'card' | 'form';
  asset: Asset | null;
  /** The payload of the instrument to create first; null when it exists. */
  create: AssetFormData | null;
  /** The instrument is the one this card created at a first attempt: the chip stays, no duplicate note. */
  createdHere: boolean;
  currency: string;
  /** The price the trade is written with: the said one, pence turned to pounds, or the corrected one. */
  pricePerUnit: number;
  /** The price was said in another currency: the card shows its price field. */
  needsPrice: boolean;
  /** The trade to post; `assetId` is empty until a new instrument is created. Null on the form route. */
  trade: AssetTransactionFormData | null;
  account: Asset | null;
  /** quantity × price ± fee, in the instrument's currency; null on the form route (a bond's price is a quote). */
  nativeTotal: number | null;
  problems: string[];
  /** What was dropped without blocking. */
  dropped: string[];
  /** The card waits (the ticker check, the ledger's meta) rather than refuses. */
  pending: boolean;
}

export function resolveTradeProposal(
  p: TradeProposal,
  refs: TradeProposalRefs,
  quote: TickerQuote | null,
  todayIso: string,
  card: { correctedPrice: number | null; createdAssetId: string | null } = { correctedPrice: null, createdAssetId: null }
): ResolvedTradeProposal {
  const problems: string[] = [];
  const dropped: string[] = [];
  let pending = false;

  let asset = p.assetId ? (refs.instruments.find((item) => item.id === p.assetId) ?? null) : null;
  if (p.assetId && !asset) problems.push(TRADE_PROBLEM.unknownInstrument);
  // A «new» instrument already held — by ticker, by the ticker the user sees, or by ISIN — is the held one: a
  // second document would split the position, and `createAsset` reuses the id an ISIN already has and
  // overwrites that document.
  let createdHere = false;
  if (p.newInstrument) {
    const ticker = p.newInstrument.ticker.toUpperCase();
    const isin = p.newInstrument.isin;
    const twin = refs.instruments.find((item) =>
      item.ticker.trim().toUpperCase() === ticker
      || (item.displayTicker ?? '').trim().toUpperCase() === ticker
      || (isin !== undefined && item.isin?.trim().toUpperCase() === isin));
    if (twin) {
      asset = twin;
      // After a failed purchase the instrument this card created comes back in the list: it is not a duplicate.
      createdHere = twin.id === card.createdAssetId;
      if (!createdHere) dropped.push(TRADE_PROBLEM.duplicate(twin.name));
    }
  }
  if (asset && !isLedgerAssetType(asset.type)) problems.push(TRADE_PROBLEM.notLedger);

  const isNew = !asset && Boolean(p.newInstrument);
  const type: AssetType | null = asset?.type ?? p.newInstrument?.type ?? null;
  const route: 'card' | 'form' = type === 'bond' ? 'form' : 'card';

  // The instrument's currency: the held one's, or what the ticker quotes in. Pence are pounds (÷ 100).
  let currency = normalizeCurrencyAmount(asset?.currency ?? p.newInstrument?.currency ?? 'EUR', 0).currency;
  let create: AssetFormData | null = null;
  if (isNew && route === 'card') {
    if (!quote || quote.status === 'loading') {
      pending = true;
    } else if (quote.status === 'missing') {
      problems.push(TRADE_PROBLEM.tickerMissing);
    } else {
      const quoted = normalizeCurrencyAmount(quote.currency, quote.price);
      currency = quoted.currency;
      if (!isListedCurrency(currency)) {
        problems.push(TRADE_PROBLEM.unlistedCurrency(currency));
      } else {
        create = {
          ticker: p.newInstrument!.ticker.toUpperCase(),
          name: p.newInstrument!.name,
          type: p.newInstrument!.type,
          assetClass: LEDGER_TYPE_CLASS[p.newInstrument!.type],
          currency,
          quantity: 0,
          currentPrice: quoted.amount,
          currentPriceEur: quote.priceEur,
          isLiquid: true,
          autoUpdatePrice: true,
          stampDutyExempt: false,
          createdEmpty: true,
          isin: p.newInstrument!.isin,
        };
      }
    }
  }

  // The price as the user said it. Another currency than the instrument's stops the card until a price is typed.
  const said = normalizeCurrencyAmount(p.priceCurrency ?? p.newInstrument?.currency ?? currency, p.pricePerUnit);
  let pricePerUnit = said.amount;
  let needsPrice = false;
  if (route === 'card' && !pending && said.currency !== currency) {
    needsPrice = true;
    if (card.correctedPrice !== null) pricePerUnit = card.correctedPrice;
    else problems.push(TRADE_PROBLEM.currencyMismatch(currency, said.currency));
  }

  if (refs.ledgerReady === null) pending = true;
  if (refs.ledgerReady === false) problems.push(TRADE_PROBLEM.ledgerOff);
  if (p.dateIso > todayIso) problems.push(TRADE_PROBLEM.futureDate);
  // A bond's holding is checked by the form, which knows its nominal.
  if (route === 'card' && p.kind === 'sell' && asset && p.quantity > asset.quantity + 1e-9) problems.push(TRADE_PROBLEM.oversell(asset.quantity));

  const account = p.accountId ? (refs.cashAssets.find((item) => item.id === p.accountId) ?? null) : null;
  if (p.accountId && !account) problems.push(TRADE_PROBLEM.unknownAccount);
  if (account && (account.currency ?? 'EUR').toUpperCase() !== 'EUR') problems.push(TRADE_PROBLEM.foreignAccount);

  const foreign = currency !== 'EUR';
  if (!foreign && p.settledTotalEur !== undefined) dropped.push(TRADE_PROBLEM.totalOnEuro);
  const fees = p.fees ?? 0;
  const total = route === 'form' ? null : roundToCents(nativeTotal({ type: p.kind, quantity: p.quantity, pricePerUnit, feesNative: fees }));
  if (total !== null && total <= 0) problems.push(TRADE_PROBLEM.feeOverTotal);

  const trade: AssetTransactionFormData | null =
    route === 'form'
      ? null
      : {
          assetId: asset?.id ?? '',
          type: p.kind,
          // Noon: the Italian day of the trade in every zone.
          date: new Date(`${p.dateIso}T12:00:00`),
          quantity: p.quantity,
          pricePerUnit,
          ...(foreign
            ? { ...(fees > 0 ? { feesNative: fees } : {}), ...(p.settledTotalEur !== undefined ? { settledTotalEur: p.settledTotalEur } : {}) }
            : fees > 0 ? { fees } : {}),
          ...(account ? { linkedCashAssetId: account.id } : {}),
          ...(p.kind === 'sell' && p.withheldTaxEur !== undefined ? { withheldTaxEur: p.withheldTaxEur } : {}),
          ...(p.note ? { note: p.note } : {}),
        };

  return { route, asset, create, createdHere, currency, pricePerUnit, needsPrice, trade, account, nativeTotal: total, problems, dropped, pending };
}
```

`feesNative` and `settledTotalEur` on `AssetTransactionFormData`, `nativeTotal`, `normalizeCurrencyAmount` and
`isListedCurrency` are DATI-06's (C2; `lib/utils/tradeFx.ts`, `lib/constants/currencies.ts`); `createdEmpty` is the
flag the form's own create writes since DATI-06 (`AssetDialog`'s ledger create, doc/guide/registro-operazioni.md). `isCalendarDate` becomes `export` in `lib/utils/expenseProposal.ts`: one calendar check for the
proposal schemas.

### 4.2 Keys and the saved outcome

- `proposalKey(kind: 'expense' | 'goal' | 'question' | 'trade', index)` (`expenseProposal.ts:128`);
  `proposalPatchSchema`'s key regex becomes `^(expense|goal|question|trade):\d+$` (`validation.ts:226`). The state
  (`AssistantProposalState`, `types/assistant.ts:24-35`) is unchanged: `writtenIds` = `[transactionId]`, or
  `[transactionId, assetId]` when this card created the instrument — at the first attempt or before a «Riprova»,
  and on the form route when the form created the bond.

### 4.3 What the model knows — `lib/utils/assistantRegisterContext.ts`, `prompts.ts`, `router.ts`

- `AssistantRegisterContext` gains `instruments: { id: string; name: string; ticker: string; type: AssetType;
  currency: string; quantity: number }[]` (the assets with `isLedgerAssetType(type)`, by name; `ticker` is
  `getAssetDisplayTicker(asset)`, the one the user sees) and `ledgerReady: boolean` (`AssistantRegisterContextInput`
  gains `ledgerReady: boolean`). On the server, `fetchRegisterInputs`
  (`lib/services/assistantMonthContextService.ts`) adds to its `Promise.all` a new exported
  `isLedgerInitialized(ownerId): Promise<boolean>` of `lib/server/assetTransactionUseCase.ts` — the read
  `assertLedgerInitialized` makes, which then calls it — and passes its answer. `formatRegisterContextForPrompt`
  prints, after IMMOBILI:

```
--- STRUMENTI ---
[id] Nome · TICKER · Tipo · VALUTA · quantità 12,5
…
```

  with `nessuno strumento` when empty and, when `ledgerReady` is false, the single line `Registro operazioni: non
  attivo` in place of the list. «Tipo» is `TRADE_TYPE_LABELS[type]`; the quantity is `formatNumberIt` with up to 8
  decimals; a legacy `GBp` prints `GBP`.
- `REGISTER_CONTRACT` (`prompts.ts:1177-1218`): the first paragraph's «…e tu gli proponi la riga da registrare nel
  Cashflow» becomes «…e tu gli proponi la riga da registrare nel Cashflow, oppure l'operazione da registrare su uno
  strumento»; the line «Al più N blocchi ```expense-proposal o al più M blocchi ```assistant-question…» gains «o al
  più ${TRADE_PROPOSALS_MAX_PER_MESSAGE} blocchi ```trade-proposal» (the constant interpolated, as the line does
  for the expenses) and stays «mai due tipi nello stesso messaggio». A new section, appended before «## Tipi di
  riga, domande e memoria»:

```
## Operazioni sui titoli
Un acquisto o una vendita di azioni, ETF, criptovalute, materie prime o obbligazioni NON è una riga del Cashflow: è un'operazione, e si propone con un blocco di codice con linguaggio `trade-proposal` che contenga SOLO JSON valido:
{ "kind": "buy" | "sell", "assetId"?: string, "newInstrument"?: { "type": "stock" | "etf" | "crypto" | "commodity" | "bond", "ticker": string, "name": string, "currency": string, "isin"?: string }, "dateIso": "YYYY-MM-DD", "quantity": number, "pricePerUnit": number, "priceCurrency"?: string, "fees"?: number, "settledTotalEur"?: number, "accountId"?: string, "withheldTaxEur"?: number, "note"?: string, "reason": string }
- Lo strumento: se è nel blocco STRUMENTI copia il suo [id] in "assetId". Se non c'è ed è un acquisto, scrivi "newInstrument": il ticker come lo quota Yahoo Finance (con il suffisso della borsa quando serve: «.MI» Milano, «.DE» Xetra, «.L» Londra; nessun suffisso per le borse USA), il nome per esteso, il tipo e la valuta di quotazione in tre lettere. Se non sei certo del ticker o della borsa, chiedilo con una domanda "trade:ticker" prima di proporre. Una vendita riguarda solo uno strumento del blocco.
- "quantity" e "pricePerUnit" sono numeri JSON positivi; il prezzo è per unità, come lo dice l'utente. Senza quantità o senza prezzo non emettere il blocco: chiedili in prosa.
- "priceCurrency": scrivilo SOLO se l'utente dice il prezzo in una valuta diversa da quella dello strumento («a 180 euro» su un titolo in dollari → "EUR"; un prezzo in pence → "GBp"). Non convertire mai tu il prezzo: la scheda si ferma e lo fa correggere.
- "fees" è la commissione nella valuta dello strumento, solo se l'utente la dice.
- Uno strumento in valuta diversa dall'euro: se l'utente dice quanto gli è stato addebitato (o accreditato) in euro in totale, scrivilo in "settledTotalEur"; se non lo dice, chiedilo UNA volta con una domanda "trade:total" con due opzioni — «Usa il cambio BCE del giorno» e «Te lo scrivo» — e "allowOther": true per scrivere il totale. Con uno strumento in euro non scrivere mai "settledTotalEur".
- Il conto: "accountId" è l'[id] del conto in euro da cui escono (o su cui entrano) i soldi, se l'utente lo nomina; se non lo nomina e i conti sono più d'uno, chiedilo con una domanda "account:"; con un conto solo usalo.
- La data è oggi, salvo che l'utente dica altro; una data futura non è ammessa.
- "withheldTaxEur" solo su una vendita e solo se l'utente dice le tasse trattenute.
- "reason" spiega in una frase quale strumento hai riconosciuto e perché.
- Un'obbligazione si propone allo stesso modo, ma "quantity" è il nominale in euro e "pricePerUnit" la quotazione in percentuale (99.5): la scheda apre il modulo dell'app già compilato.
- Al massimo ${TRADE_PROPOSALS_MAX_PER_MESSAGE} blocchi per messaggio, ciascuno su righe sue fuori da elenchi e citazioni: se l'utente nomina più operazioni, proponi le prime e scrivi «Ne restano N: vuoi che continui?».
- Se il blocco STRUMENTI dice «Registro operazioni: non attivo», non proporre operazioni: scrivi che il registro si avvia da solo aprendo Patrimonio.
- Una rettifica di quantità non si propone: si fa da Patrimonio.
- Un'operazione muove da sola il conto che nomina: non proporre anche una riga di Cashflow per lo stesso movimento.
```

- `ASSISTANT_ROUTER_SYSTEM` (`router.ts:55-57`): the `register` line becomes «register: racconta un movimento da
  registrare — una spesa, un'entrata, uno spostamento tra conti, una rata pagata, un acquisto o una vendita di
  titoli. «oggi ho speso 40 euro al supermercato», «benzina 60», «è arrivato lo stipendio», «ho spostato 500 euro
  sul deposito», «ho comprato 10 azioni Alfa a 50 euro».»

### 4.4 The browser's references — `components/assistant/RegisterRefsContext.tsx`

`useRegisterReads` (`:44`) already reads the assets (the accounts, the properties and the loans are slices of that
read): `RegisterReads` and `RegisterRefsValue` gain `trade: TradeProposalRefs` — `instruments`
(`isLedgerAssetType`), `cashAssets` (the same list `refs.cashAssets` holds), `ledgerReady`. `RegisterRefsProvider`
gains the prop `trade` (the context's default: `{ instruments: [], cashAssets: [], ledgerReady: null }`) and
`components/assistant/AssistantPageClient.tsx` passes `registerReads.trade`; the two existing tests that mount the
provider (`__tests__/expenseProposalCard.test.tsx`, `__tests__/assistantQuestionBlock.test.tsx`) pass that default.

`ledgerReady`: `useAssetLedgerMeta(enabled ? ownerId : undefined)` (the hook has no `enabled` option). `null`
while the meta is loading; a meta that answers `null` from the restored cache is asked once more with
`fetchFreshLedgerMeta(queryClient, ownerId)` (`lib/hooks/useAssetTransactions.ts`: the ledger may have been started
on another device) and only then reads `false`; a failed meta read joins `readFailed`.

### 4.5 The card — `components/assistant/TradeProposalCard.tsx` (new)

The shape and the states of `ExpenseProposalCard` (same tile, same buttons, same focus rule, same saved outcome —
`PROPOSAL_STATE_NOT_SAVED` included when the PATCH of the outcome fails); `MarkdownPre`
(`AssistantStreamingResponse.tsx:108-113`) renders it for `block.language === TRADE_PROPOSAL_LANGUAGE && mode ===
'register' && block.index < TRADE_PROPOSALS_MAX_PER_MESSAGE`, through `lazyComponent` — the card and what it
imports (`tradeProposal`, `tradeFx`, `useFxRate`) must not enter the first load of a page with 0,6 KB of room.

- The ticker check: `useQuery({ queryKey: queryKeys.prices.quote(ticker), enabled, queryFn })` on
  `/api/prices/quote?ticker=` → `TickerQuote` (`found` when `price > 0`, else `missing`; a failed request is
  `missing`); `staleTime` 5 minutes; `enabled` = a `newInstrument` whose type is not `bond`, outside demo mode
  (the demo writes nothing and asks nothing). `queryKeys.prices.quote` is new in `lib/query/queryKeys.ts`.
- `const [todayIso] = useState(() => getItalyDateIso());` (a render never reads the clock), `const [correctedPrice,
  setCorrectedPrice] = useState<number | null>(null);`, `const createdRef = useRef<{ assetId?: string }>({});` and
  `const resolved = resolveTradeProposal(proposal, refs.trade, quote, todayIso, { correctedPrice, createdAssetId:
  createdAssetId })` — `createdAssetId` a state set beside the ref when the instrument is created.
- Lines: head «Acquisto» / «Vendita» + the instrument's name and ticker, with the chip «Nuovo strumento ·
  {TRADE_TYPE_LABELS}» when `resolved.create || resolved.createdHere`; `{quantity} × {pricePerUnit} {currency}`;
  «Commissione {fee} {currency}»; «Totale {nativeTotal} {currency}»; the day; the account («{name}» or
  `PROPOSAL_NO_ACCOUNT_LABEL`); the reason; each `dropped` note in `text-muted-foreground`.
- **The price field** (decision 85), only when `resolved.needsPrice`: a labelled numeric input «Prezzo per unità
  in {currency}», empty at first, under the problem line; a positive value sets `correctedPrice`, the problem
  clears, the lines above reprint with it; emptied, the problem is back. The saved outcome keeps no trace of it:
  a reload of a card not yet confirmed asks again.
- In another currency, under the total: `describeTradeFx(currency, fx.fxRate, fx.fxSource, date)` and «≈ {eur}»
  from `resolveTradeFx` over the proposal and `useFxRate(currency, dateIso)` (C2) — a preview, the server decides.
  While the rate loads the line reads «Leggo il cambio…» and «Conferma» stays as the rest allows;
  `TradeFxError('no-rate')` → «Cambio non disponibile: il totale si calcola al salvataggio.», not a block;
  `TradeFxError('total-off')` → `describeTotalOff(...)` as a problem that blocks.
- Buttons: «Conferma» and «Ignora»; no «Modifica» on the card route.
- The write, module-level (the React Compiler: no branch inside the card's `try`):

```ts
async function writeTradeProposal(
  ownerId: string,
  resolved: ResolvedTradeProposal,
  created: { assetId?: string }
): Promise<{ result: AssetTransactionMutationResult; writtenIds: string[] }> {
  if (!resolved.trade) throw new Error('form route');
  let assetId = resolved.asset?.id ?? created.assetId;
  if (!assetId) {
    if (!resolved.create) throw new Error('nothing to create');
    assetId = await createAsset(ownerId, resolved.create);
    // Kept for the retry: a failed purchase must not create the instrument twice.
    created.assetId = assetId;
  }
  const result = await createAssetTransaction(ownerId, { ...resolved.trade, assetId });
  // The instrument is this card's when it created it, at this attempt or at the one before.
  return { result, writtenIds: created.assetId ? [result.transactionId, created.assetId] : [result.transactionId] };
}
```

  On success: `recordProposal(key, { status: 'written', writtenIds })`; the toast «Operazione registrata» (with
  `created.assetId` set: «Strumento creato e acquisto registrato»), followed by `· ${TRADE_FEE_NOT_WRITTEN}` when
  `result.feeRow === 'refused'`, as the form says it; `toast.info(describeAnnouncedDividendsOutcome(
  result.announcedDividends))` when it is not null, as `TransactionDialog` does (DATI-04);
  `invalidateTradeCaches(queryClient, ownerId)` — which becomes `export function` in
  `lib/hooks/useAssetTransactions.ts` and already covers the assets, the expenses and the overview — then the
  PATCH. On failure with `createdRef.current.assetId` set: the error line «Strumento creato, ma l'acquisto non è
  stato registrato: {message}» and the button reads «Riprova»; `queryKeys.assets.all` is invalidated so the empty
  instrument shows in Patrimonio («Mai comprato»).
- **The form route** (a bond): the card shows «Nominale {quantity} € · quotazione {pricePerUnit}», the day, the
  account, the reason and NO total, the note «Un'obbligazione si completa nel modulo: il prezzo è la quotazione»
  and ONE primary button «Completa nel modulo», under the same conditions as «Conferma». Both forms are loaded
  with `lazyComponent`, take `returnFocusTo` = the card's button, and are prefilled:
  - `components/assets/TransactionDialog.tsx`: `prefill` gains `date?: Date`, `pricePerUnit?: number` (for a bond
    the quote in percent, the form's own price field), `fees?: number` (the form's fee field, in the instrument's
    currency), `settledTotalEur?: number` and `withheldTaxEur?: number`, each applied at the create reset where
    `type` and `quantity` are today; the component gains `returnFocusTo?: React.RefObject<HTMLElement | null>`,
    passed to `ResponsiveModal` as `AssetDialog` does.
  - `components/assets/AssetDialog.tsx`: a new prop `createPrefill?: { name?: string; ticker?: string; isin?:
    string; currency?: string }`, applied at the create reset beside `initialType`.
  - held bond → `TransactionDialog` with `asset`, `prefill={{ type, quantity, date, pricePerUnit, fees,
    settledTotalEur, withheldTaxEur, linkedCashAssetId, note }}` and `onCreated={(result) =>
    written([result.transactionId])}`;
  - new bond → `AssetDialog` with `initialType="bond"`, `createPrefill` from `newInstrument` and
    `onRegisterTrade={(created) => …}`: since DATI-06 (C2, the ONE form) the form creates the bond EMPTY and hands it over — the
    card keeps `created` in state and opens the same `TransactionDialog` on it, with the same prefill and
    `onCreated={(result) => written([result.transactionId, created.id])}`. A form closed without a purchase leaves
    the card open, and its button then opens the trade form on the bond already created.
  - The first coupon and the final premium of a new bond are the trade form's (`scheduleCouponsForOpenedPosition`,
    DATI-04), not the card's.
- Written state: the line «registrata» and the link «apri in Patrimonio» → `/dashboard/assets`.
- `lib/utils/proposalCardState.ts` (new — the state of a proposal card that is not an expense's; DATI-17's card
  calls it too): `describeProposalCardState(input: { saved: AssistantProposalState | undefined; problems:
  string[]; pending: boolean; waitLine: string; writtenLine: string; confirmLabel: string; flags:
  ProposalCardFlags })` → `{ status: 'written' | 'ignored' | 'interrupted' | 'saving' | 'open'; line: string |
  null; waitLine: string | null; canConfirm: boolean; canIgnore: boolean; confirmLabel: string }`, with `export
  interface ProposalCardFlags { messageId: string; saving: boolean; readFailed: boolean; isDemo: boolean;
  hasQuestionBlock: boolean }`. The order, as `describeExpenseProposalState` (`expenseProposal.ts:688`): the
  saved states (`writtenLine`, «ignorata»); then `PROPOSAL_INTERRUPTED_LINE` (a `local-` message id); then
  `saving`; then open — `line` = the first problem, else `PROPOSAL_WAITS_FOR_ANSWER_LINE` with a question block in
  the message, else null; `waitLine` = the input's when `pending`; `canConfirm = !readFailed && !isDemo &&
  !hasQuestionBlock && problems.length === 0 && !pending`. Demo and a failed read print no line of their own
  (the expense card prints none). This card passes `writtenLine: 'registrata'`, `waitLine: TRADE_WAIT_LINE` and
  `confirmLabel` = «Completa nel modulo» on the form route, «Riprova» with the created instrument's id set, else
  «Conferma».

### 4.6 The fake stream — `e2e/assistantRegister.ts`

`proposalBlock` (`:178`) gains a sibling `tradeBlock(proposal)`; `installFakeStream` is the one whose reply is `FakeAnswer` (`e2e/assistantRegister.ts`, with `followUps` and `statuses`)
(its reply `{ text, reading, followUps?, statuses? }`) and is not changed here. The fixture plants — and
`removeFixture` removes — the ledger's meta document `assetTransactionsMeta/{UID}` when it is absent (the
precedent: `e2e/assets.trade-fee.spec.ts`) and an instrument «Azione Alfa» (ALFA, EUR, quantity 10) with an
`e2e-reg-*` id. The specs route the quote service (`page.route('**/api/prices/quote?*', …)`) and the rate
(`'**/api/fx/rate?*'`, a fixed rate), so no test reaches Yahoo or Frankfurter.

## 5. Constraints and traps

- **Nothing is written before «Conferma», and once** (doc/guide/assistente-registra.md): the card is the only
  writer; a reload shows the saved outcome, never a second «Conferma».
- **C2 is used as the index § 7 states it**: `feesNative`, `settledTotalEur`, `nativeTotal`, `resolveTradeFx`,
  `describeTradeFx`, `describeTotalOff`, `useFxRate`, `normalizeCurrencyAmount`, `isListedCurrency`; the server is
  the authority on the euro price — the card only previews.
- **C4**: the question card is the Assistente's (`keepQuestionBlock(ordinal, mode)` in `lib/utils/questionSet.ts`; doc/guide/assistente-risposta.md § A question back); Registra has its own protocol (no `ANSWER_CONTRACT`, no follow-ups
  block: its chips are `REGISTER_STARTER_FOLLOW_UPS` and, after a written card, `REGISTER_ANOTHER_FOLLOW_UP` — a
  written trade card counts as one). `QUESTION_OPTIONS_MIN` is 2 (`lib/utils/questionSet.ts`): a question with one
  option does not parse and prints as code.
- **The system prompt is static**: `REGISTER_CONTRACT` is a constant; the instruments are in the data block.
- **A ledger instrument opens EMPTY** (`quantity: 0`, no `averageCost`, `createdEmpty: true`) and its first buy
  opens the position; never `createAsset` with the bought quantity.
- **`createAsset` with an ISIN reuses the id that ISIN already has and replaces the document** (`setDoc`,
  `lib/services/assetService.ts`): the twin check by ISIN is what keeps a held instrument from being overwritten.
- **ONE purchase form** (decision 60): a bond is never written by the card, and a new bond is never given its
  first purchase by `AssetDialog`.
- **The server's refusals are the truth**: 409 (ledger not initialised), 422 (`SELL_EXCEEDS_HOLDING`, a future
  date), 503 (FX) come back as the error line (`describeWriteError`); the card's own checks only spare the round
  trip — two cards of one message selling the same instrument each read the holding before either wrote.
- **Nothing here spends** (index § 8 rule 5): every test and § 7 run on the fake stream; no real model, no Yahoo.
- **Demo mode**: no write and no ticker check (`useDemoMode`).
- **The Modal-Is-A-Tile Rule** for the two dialogs opened from the card; `returnFocusTo` the card's button
  (CLAUDE.md § Known Issues).
- **No owner data**: «Azione Alfa» (ALFA), «ETF Beta» (BETA.MI), «BTP Prova 2032», round figures.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| S1 | unit · `__tests__/tradeProposal.test.ts` | a valid buy on a held instrument resolves to a trade with noon of the day, the account, the fee as `fees`; `fees: 0` parses and writes no fee; both or neither of `assetId`/`newInstrument` do not parse; a sale of a new instrument does not parse; a malformed ISIN is dropped and the proposal still parses; a currency of three unknown letters parses | accept both; `fees` positive only |
| S2 | unit · same | a new share with a found quote → `create` with class equity, quantity 0, `createdEmpty: true`, the quote's price and currency; quote loading → `pending`, no create, no problem; missing → the ticker problem; a ticker, a display ticker or an ISIN already held → the held instrument, `create: null`, the duplicate note; the same twin with `createdAssetId` = its id → `createdHere`, no note | create with the bought quantity; twin by ticker only |
| S3 | unit · same | a USD instrument: `feesNative` and `settledTotalEur` on the trade, no `fees`; a EUR instrument with a total → dropped with its note; `nativeTotal` is `tradeFx`'s | `fees` for a foreign fee |
| S4 | unit · same | each its problem: a sale beyond the holding (mutation: drop the check), a future day (`>=` for `>`), an unknown account (accept it), a non-EUR account (accept it), the ledger off (`null` read as off), a sale whose fee exceeds its gross (no check); the ledger `null` → `pending`, no problem; a bond → `route: 'form'`, `trade: null`, `nativeTotal: null`, no oversell problem | the one named beside each case |
| S5 | unit · same | a held USD instrument with `priceCurrency: 'EUR'` → the mismatch problem with both codes, `needsPrice`; with `correctedPrice: 195` → no problem, the trade at 195; a new instrument guessed EUR that quotes USD → the same; a quote in `GBp` 4874 → GBP, `currentPrice` 48,74; a price said in `GBp` on a GBP instrument → ÷ 100, no problem; a quote in KRW → the unlisted problem, no create | take the quote's currency silently; no ÷ 100 |
| N1 | unit · `__tests__/proposalCardState.test.ts` | the order: written, ignored, interrupted, saving, then open with the first problem, else the question line; pending → the wait line, no problem line, no confirm; demo and failed read disable with no line; the `writtenLine` and the `confirmLabel` given come back as given | problem before saved |
| X1 | unit · `__tests__/assistantRegisterContext.test.ts` | the STRUMENTI block lists the ledger instruments with id, display ticker, the Italian type, currency, quantity («12,5»); a cash account is not in it | every asset |
| X2 | unit · same | ledger off → the single line, no list | list anyway |
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | the contract has «## Operazioni sui titoli», names `trade-proposal`, `priceCurrency`, the two options of «trade:total» and the three-block line with «Ne restano N»; the system is still equal for two users | drop the section from the contract |
| R1 | unit · `__tests__/assistantRouter.test.ts` | the router's system names «un acquisto o una vendita di titoli» with its example | the register line as it was |
| V1 | unit · `__tests__/serverValidation.test.ts` | the PATCH accepts `trade:0`, refuses `trade:x` and `other:0` | open regex |
| D1 | dom · `__tests__/tradeProposalCard.test.tsx` (new) | a held instrument: the lines, «Conferma» posts ONE trade with the resolved payload, the outcome is recorded and patched, the announced-dividends sentence is toasted when the answer carries one | post at render |
| D2 | dom · same | a new instrument: `createAsset` then the trade with the new id, in that order; `writtenIds` holds both; the toast «Strumento creato e acquisto registrato» | trade first |
| D3 | dom · same | quote loading → «Conferma» disabled, the wait line, no red line; quote missing → the ticker problem, disabled; the ledger's meta pending → disabled with no red line; in demo no quote request leaves | confirm without a quote |
| D4 | dom · same | a USD instrument shows the rate line of C2 and the euro estimate; the rate loading → «Leggo il cambio…»; no rate → «Cambio non disponibile…», «Conferma» enabled; a total 40% off the ECB rate blocks with its sentence | no check |
| D5 | dom · same | the trade rejecting after the create → the «Strumento creato, ma…» line and «Riprova», the chip still there and no duplicate note after the assets refetch; the retry calls `createAsset` zero times more, `writtenIds` holds both ids and the toast is the «Strumento creato…» one | create again; `writtenIds` without the asset on a retry |
| D6 | dom · same | a held bond: «Nominale 5.000 € · quotazione 99,5», no «Totale»; «Completa nel modulo» opens the trade form with date, quote, quantity, fee and account in its fields; its `onCreated` closes the card as written; closing the form returns the focus to the card's button | `onCreated` not calling `written`; a total on a bond |
| D6b | dom · same | a new bond: the asset form opens on «Obbligazione» with name, ticker, ISIN and currency filled; its `onRegisterTrade` opens the trade form on the created bond with the same prefill; that form's `onCreated` writes `[transactionId, assetId]`; the asset form closed without a purchase leaves the card open | `written` at `onRegisterTrade` |
| D7 | dom · same | a saved `written` outcome renders the line and the link, no buttons; `ignored` likewise | buttons on a written card |
| D8 | dom · `__tests__/assistantStreamingResponse.test.tsx` | the block renders a card only on a `register` message and only the first three | card in chat |
| D9 | dom · `__tests__/tradeProposalCard.test.tsx` | a price said in euro on a USD instrument: the sentence of decision 85, the field «Prezzo per unità in USD», «Conferma» disabled; typing 195 enables it and the trade posts at 195; emptied, disabled again | post the said price |
| E1 | e2e · `e2e/assistant.register.trade.spec.ts` (new, fake SSE) | a buy on the planted instrument: «Conferma» → the trade is in Patrimonio's «Movimenti», the account moved; reload → «registrata» | the card not invalidating the trade caches |
| E2 | e2e · same | a new instrument (quote routed): after «Conferma» it exists in Patrimonio with the bought quantity and ONE trade | `createAsset` with the bought quantity |
| E3 | e2e · `e2e/assistant.register.trade.mobile.spec.ts` (new) | 390: the card, also with its price field, has no horizontal overflow; the targets are ≥ 44 px | the card's row without `min-w-0` |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the fake stream a `trade-proposal` for a held instrument shows one card and
«Conferma» records one trade; for a new instrument the card says «Nuovo strumento», creates it and records the
purchase; a USD purchase shows «EUR/USD … · dal totale dell'estratto»; a price said in euro on a USD share stops
the card until a price in dollars is typed; a bond opens the form already filled.

- A — the diff. B–E by a throwaway Playwright script on the emulators with `installFakeStream` (no model; the
  quote and the rate routed) at 1440 and 390, light and dark: B a buy and a sale on held instruments; C a new
  instrument (quote found, then missing, then in a currency outside the list), the retry after a planted trade
  failure; D a USD purchase with and without the total, a total far from the ECB rate, the price said in euro, a
  price in pence; E a bond (held, new — the two forms prefilled), demo mode, the ledger off, a reload of each
  written card. Decoys: «ornitorinco» (a `trade-proposal` in a message not read as a registration: it renders as
  code) and «fenicottero» (a fourth block in one message: code).
- F — at the owner's «pronto», on the mirror with the real model, by his hand: one purchase told in words on an
  instrument he holds and one on a new one — the mirror is removed at the end (`npm run mirror:remove`).

## 8. Putting it into service

No rules, no index: the writes are the forms'. The PATCH key's new kind is accepted by the server from this
deploy; an older client never sends it. Measure: `npm run perf:budget` on `/dashboard/assistant` and
`/dashboard/assets` (the two forms' new props), inside their ceilings; a ceiling is raised by no more than 1 KB gz
and only with the register row (index § 8 rule 7). With phase F closed and the commit in `develop`, the owner
opens the PR `develop` → `main` (index § 8 rule 13).

## 9. Documentation

- `doc/guide/assistente-registra.md` — § «Operazioni sui titoli» (the block, the card's two routes, the ticker
  check and the twin by ticker and ISIN, the create-then-buy order and its retry, C2 on the card, the price said
  in another currency, the prefilled forms); § Files; § Per-page blind spots: a hand-priced instrument and an
  adjustment are not proposed; a bond goes through the form; the card's euro figure is a preview; the new
  instrument takes the form's defaults and the model's type (edit it in Patrimonio); a new instrument in a
  currency outside the list is refused; after a corrected price the fee stays as written; two cards of one
  message on the same instrument each check the holding before either writes; a day at the weekend takes the
  ECB rate of the working day before; more than three trades are proposed three at a time; editing or deleting a
  trade and recording a dividend are not done from the chat.
- `doc/guide/assistente.md` — the router's wider `register`. `doc/guide/registro-operazioni.md` — a third writer of
  trades (the card), same route; `TransactionDialog`'s wider `prefill` and `returnFocusTo`, `AssetDialog`'s
  `createPrefill`. `doc/guide/dialog.md` — the two forms opened from a card. `doc/guide/e2e-emulatori.md` — the
  fixture's ledger meta and instrument. `doc/guide/velocita.md` § Registro — only if a ceiling was raised.
- `README.md` — Assistente › Registra's feature lines. `AGENTS.md` § 3 — the stubs of the guides touched rewritten
  at equal or shorter length (decision 47).
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Assistente —
  racconta un acquisto o una vendita** — Registra now reads a trade told in words: one card creates the
  instrument when it is new and records the operation; a bond opens the purchase form already filled.»
- `CLAUDE.md` — the Assistente line rewritten at equal or shorter length with «Registra also records a trade and
  creates its instrument»; the «Latest» entry REPLACED whole (decision 46: the date, this spec in one sentence,
  «Open: doc/dati/ (README § 6)», «Next: DATI-17»); under 20.000 characters, counted with `node`.
- `doc/dati/README.md` § 6 (the row of 16 to `implemented`).

## 10. Declared out of scope

- A cash account, a property, a pension fund, a loan created from the chat → DATI-17.
- An adjustment, a hand-priced instrument, editing or deleting a trade from the chat →
  doc/guide/assistente-registra.md § Per-page blind spots.
- Several trades from a pasted statement (more than three) → the same section (the contract makes the model
  propose three and say how many remain).
- A dividend recorded from the chat → the same section.
- Reading the quote's type to correct the model's → the same section; DATI-19 reads the same `LEDGER_TYPE_CLASS`.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-16-registra-operazioni-e-strumenti.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C2 e C4 —, regole della serie)
- Leggi doc/guide/assistente-registra.md, doc/guide/assistente.md, doc/guide/registro-operazioni.md,
  doc/guide/dialog.md, doc/guide/velocita.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (The Modal-Is-A-Tile Rule) e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic (il contratto di Registra e lo smistatore): usa la skill claude-api prima
  di toccare i prompt
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

Implementa la spec così com'è scritta, nell'ordine: la proposta pura con S1–S5 e N1, la chiave e la
PATCH (V1), il blocco STRUMENTI con fetchRegisterInputs e il contratto (X1, X2, P1, R1), i riferimenti
del browser (RegisterRefsContext, AssistantPageClient, i due test esistenti del provider), i due moduli
(TransactionDialog: prefill più largo e returnFocusTo; AssetDialog: createPrefill), l'export di
invalidateTradeCaches, la scheda caricata a richiesta (D1–D9, D6b), il finto flusso con la sua fixture
ed E1–E3, perf:budget, i documenti del § 9 e la riga 16 di doc/dati/README.md § 6 a `implemented`. OGNI
test del § 6 va visto rosso con la sua mutazione. Il codice del § 4.1 e la funzione di scrittura del
§ 4.5 sono già scritti: copiali.

Fermati e chiedimi se: DATI-06, DATI-08 o DATI-04 non sono in develop con i contratti dell'indice
(nativeTotal, normalizeCurrencyAmount, AssetDialog che crea vuoto e chiama onRegisterTrade, la
risposta con announcedDividends — nomi o firme diversi), un test arriverebbe a chiamare il modello o
Yahoo, la creazione di uno strumento richiede un campo che la spec non elenca, oppure
/dashboard/assistant supera il suo tetto di più di 1 KB gz.

Collaudo: § 7 sul finto flusso; la F al mio «pronto», di mia mano. Un branch, un commit, solo dopo il
mio OK con il riassunto del diff. SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR
develop → main (regola 13 dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec: a new proposal kind that writes instruments and trades, on two
shared contracts, with a non-atomic write to hold. Estimated size: L (two pure modules, one card, two forms'
props, the contract, the context, 24 tests).
