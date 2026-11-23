# DATI-16 — Assistente › Registra: a purchase or a sale told in words, and the instrument created with it

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-08 (contract C4: the answer's tail, the
> question card, the rewritten system core) and DATI-06 (contract C2: the foreign-currency trade fields, `tradeFx`,
> `useFxRate`).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 6; decisions 23, 29.

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
   confirmed. Proof: S2, D2, D3.
4. An instrument in another currency follows C2: the price and the fee in its currency, the euro total when the
   user gave it, else the ECB rate of the day; the card shows the rate and where it comes from. Proof: S3, D4.
5. If the instrument was created and the purchase then failed, the card says so and «Riprova» records only the
   purchase. Proof: D5.
6. A sale names an instrument held; a sale of more than is held is refused on the card before any write. Proof: S4.
7. A bond — one held or a new one — is completed in the app's own form, opened from the card already filled; the
   card closes as written when the form saves. Proof: D6.
8. The outcome is saved on the message (`trade:N`) and survives a reload; a written card links to Patrimonio.
   Proof: D7, V1.
9. With the ledger not initialised the model proposes nothing and says where to start it. Proof: C2.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1–E3 green
    (fake SSE: no model is called).

## 3. Decisions

- **Decision 23** (owner, 2026-11-23, in his words): «Io farei tutti i tipi, e ovviamente in base al tipo fa le
  domande giuste» — this spec covers the ledger types; DATI-17 the others.
- **Decision 29** (owner, 2026-11-23): one card, «crea e registra».
- Standing rule of Registra (2026-11): a row is proposed as a card and written by the browser on «Conferma», once.
- Adopted, reversible:
  - (a) a new block language, `trade-proposal`, beside `expense-proposal`: the two schemas share no field worth a
    union. At most 3 per message; never mixed with the other block kinds.
  - (b) a new instrument from the chat needs a ticker that quotes; a hand-priced instrument is created from
    Patrimonio (the answer says so).
  - (c) a bond goes through the form: its price is a quote in percent of par scaled by the nominal and, for a
    BTP€i, a coefficient (`lib/utils/bondPricing.ts:1-22`) and a new bond has a coupon schedule — one rule, the
    form's.
  - (d) the new instrument takes the form's defaults: class from its type, liquid, price updated automatically,
    26% tax rate left to the form's default (unset).
  - (e) an `adjustment` is not proposed from the chat.
  - (f) a trade moves its account by itself (`linkedCashAssetId`): no cashflow row is proposed for it.

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
import { INSTRUMENT_CURRENCIES } from '@/lib/constants/currencies';
import { roundToCents } from '@/lib/utils/cents';

export const TRADE_PROPOSAL_LANGUAGE = 'trade-proposal';
export const TRADE_PROPOSALS_MAX_PER_MESSAGE = 3;

function isCalendarDate(dateIso: string): boolean {
  const [year, month, day] = dateIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const NEW_INSTRUMENT_TYPES = ['stock', 'etf', 'crypto', 'commodity', 'bond'] as const;

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
        currency: z.enum(INSTRUMENT_CURRENCIES),
        isin: z.string().trim().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/).optional(),
      })
      .optional(),
    dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isCalendarDate),
    quantity: z.number().positive().max(1_000_000_000),
    // Per unit, in the instrument's currency.
    pricePerUnit: z.number().positive().max(100_000_000),
    // In the instrument's currency.
    fees: z.number().positive().max(1_000_000).optional(),
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
  /** The trade ledger was initialised (`useAssetLedgerMeta`). */
  ledgerReady: boolean;
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
  ledgerOff: 'Il registro operazioni non è ancora attivo: avvialo da Patrimonio',
  oversell: (held: number) => `Ne possiedi ${held.toLocaleString('it-IT', { maximumFractionDigits: 8 })}: non puoi venderne di più`,
  tickerMissing: 'Il ticker non ha una quotazione: controlla il simbolo',
  tickerLoading: 'Controllo il ticker…',
  duplicate: (name: string) => `Hai già «${name}» con questo ticker: l'operazione va su quello`,
  totalOnEuro: 'ignorato: totale in euro (lo strumento è in euro)',
} as const;

export interface ResolvedTradeProposal {
  /** `'form'`: a bond — the app's own form completes it. */
  route: 'card' | 'form';
  asset: Asset | null;
  /** The payload of the instrument to create first; null when it exists. */
  create: AssetFormData | null;
  currency: string;
  /** The trade to post; `assetId` is empty until a new instrument is created. Null on the form route. */
  trade: AssetTransactionFormData | null;
  account: Asset | null;
  /** quantity × price ± fee, in the instrument's currency. */
  nativeTotal: number;
  problems: string[];
  /** What was dropped without blocking. */
  dropped: string[];
  /** A problem that waits (the ticker check) rather than refuses. */
  pending: boolean;
}

export function resolveTradeProposal(
  p: TradeProposal,
  refs: TradeProposalRefs,
  quote: TickerQuote | null,
  todayIso: string
): ResolvedTradeProposal {
  const problems: string[] = [];
  const dropped: string[] = [];
  let pending = false;

  let asset = p.assetId ? (refs.instruments.find((item) => item.id === p.assetId) ?? null) : null;
  if (p.assetId && !asset) problems.push(TRADE_PROBLEM.unknownInstrument);
  // A «new» instrument whose ticker is already held is the held one: a second document would split the position.
  if (p.newInstrument) {
    const twin = refs.instruments.find((item) => item.ticker.trim().toUpperCase() === p.newInstrument!.ticker.toUpperCase());
    if (twin) {
      asset = twin;
      dropped.push(TRADE_PROBLEM.duplicate(twin.name));
    }
  }
  if (asset && !isLedgerAssetType(asset.type)) problems.push(TRADE_PROBLEM.notLedger);

  const isNew = !asset && Boolean(p.newInstrument);
  const type: AssetType | null = asset?.type ?? p.newInstrument?.type ?? null;
  const route: 'card' | 'form' = type === 'bond' ? 'form' : 'card';

  let currency = (asset?.currency ?? p.newInstrument?.currency ?? 'EUR').toUpperCase();
  let create: AssetFormData | null = null;
  if (isNew && route === 'card') {
    if (!quote || quote.status === 'loading') {
      pending = true;
      problems.push(TRADE_PROBLEM.tickerLoading);
    } else if (quote.status === 'missing') {
      problems.push(TRADE_PROBLEM.tickerMissing);
    } else {
      // The quote's currency is the instrument's: the model may have guessed another.
      currency = quote.currency.toUpperCase();
      create = {
        ticker: p.newInstrument!.ticker.toUpperCase(),
        name: p.newInstrument!.name,
        type: p.newInstrument!.type,
        assetClass: LEDGER_TYPE_CLASS[p.newInstrument!.type],
        currency,
        quantity: 0,
        currentPrice: quote.price,
        currentPriceEur: quote.priceEur,
        isLiquid: true,
        autoUpdatePrice: true,
        stampDutyExempt: false,
        isin: p.newInstrument!.isin,
      };
    }
  }

  if (!refs.ledgerReady) problems.push(TRADE_PROBLEM.ledgerOff);
  if (p.dateIso > todayIso) problems.push(TRADE_PROBLEM.futureDate);
  if (p.kind === 'sell' && asset && p.quantity > asset.quantity + 1e-9) problems.push(TRADE_PROBLEM.oversell(asset.quantity));

  const account = p.accountId ? (refs.cashAssets.find((item) => item.id === p.accountId) ?? null) : null;
  if (p.accountId && !account) problems.push(TRADE_PROBLEM.unknownAccount);
  if (account && (account.currency ?? 'EUR').toUpperCase() !== 'EUR') problems.push(TRADE_PROBLEM.foreignAccount);

  const foreign = currency !== 'EUR';
  if (!foreign && p.settledTotalEur !== undefined) dropped.push(TRADE_PROBLEM.totalOnEuro);
  const fees = p.fees ?? 0;
  const gross = p.quantity * p.pricePerUnit;
  const nativeTotal = roundToCents(p.kind === 'buy' ? gross + fees : gross - fees);

  const trade: AssetTransactionFormData | null =
    route === 'form'
      ? null
      : {
          assetId: asset?.id ?? '',
          type: p.kind,
          // Noon: the Italian day of the trade in every zone.
          date: new Date(`${p.dateIso}T12:00:00`),
          quantity: p.quantity,
          pricePerUnit: p.pricePerUnit,
          ...(foreign
            ? { ...(fees > 0 ? { feesNative: fees } : {}), ...(p.settledTotalEur !== undefined ? { settledTotalEur: p.settledTotalEur } : {}) }
            : fees > 0 ? { fees } : {}),
          ...(account ? { linkedCashAssetId: account.id } : {}),
          ...(p.kind === 'sell' && p.withheldTaxEur !== undefined ? { withheldTaxEur: p.withheldTaxEur } : {}),
          ...(p.note ? { note: p.note } : {}),
        };

  return { route, asset, create, currency, trade, account, nativeTotal, problems, dropped, pending };
}
```

`feesNative` and `settledTotalEur` on `AssetTransactionFormData` are C2 (DATI-06 § 4.1).

### 4.2 Keys and the saved outcome

- `proposalKey(kind: 'expense' | 'goal' | 'question' | 'trade', index)` (`expenseProposal.ts:128`);
  `proposalPatchSchema`'s key regex becomes `^(expense|goal|question|trade):\d+$` (`validation.ts:226`). The state
  (`AssistantProposalState`, `types/assistant.ts:24-35`) is unchanged: `writtenIds` = `[transactionId]` or
  `[transactionId, assetId]` when the instrument was created.

### 4.3 What the model knows — `lib/utils/assistantRegisterContext.ts`, `prompts.ts`, `router.ts`

- `AssistantRegisterContext` gains `instruments: { id: string; name: string; ticker: string; type: AssetType;
  currency: string; quantity: number }[]` (the assets with `isLedgerAssetType(type)`, by name) and `ledgerReady:
  boolean` (`AssistantRegisterContextInput` gains `ledgerReady: boolean`; the server passes the existence of the
  ledger's meta document — a new exported `isLedgerInitialized(ownerId): Promise<boolean>` in
  `lib/server/assetTransactionUseCase.ts`, the read `assertLedgerInitialized` makes (`:174-175`), which then calls
  it — beside the context's other reads; the browser passes `useAssetLedgerMeta`'s). `formatRegisterContextForPrompt` prints, after
  IMMOBILI:

```
--- STRUMENTI ---
[id] Nome · TICKER · Tipo · VALUTA · quantità 12
…
```

  with `nessuno strumento` when empty and, when `ledgerReady` is false, the single line `Registro operazioni: non
  attivo` in place of the list.
- `REGISTER_CONTRACT` (`prompts.ts:1177-1218`): the first paragraph's «…e tu gli proponi la riga da registrare nel
  Cashflow» becomes «…e tu gli proponi la riga da registrare nel Cashflow, oppure l'operazione da registrare su uno
  strumento»; the line «Al più N blocchi ```expense-proposal o al più M blocchi ```assistant-question…» gains «o al
  più 3 blocchi ```trade-proposal» and stays «mai due tipi nello stesso messaggio». A new section, appended before
  «## Tipi di riga, domande e memoria»:

```
## Operazioni sui titoli
Un acquisto o una vendita di azioni, ETF, criptovalute, materie prime o obbligazioni NON è una riga del Cashflow: è un'operazione, e si propone con un blocco di codice con linguaggio `trade-proposal` che contenga SOLO JSON valido:
{ "kind": "buy" | "sell", "assetId"?: string, "newInstrument"?: { "type": "stock" | "etf" | "crypto" | "commodity" | "bond", "ticker": string, "name": string, "currency": string, "isin"?: string }, "dateIso": "YYYY-MM-DD", "quantity": number, "pricePerUnit": number, "fees"?: number, "settledTotalEur"?: number, "accountId"?: string, "withheldTaxEur"?: number, "note"?: string, "reason": string }
- Lo strumento: se è nel blocco STRUMENTI copia il suo [id] in "assetId". Se non c'è ed è un acquisto, scrivi "newInstrument": il ticker come lo quota Yahoo Finance (con il suffisso della borsa quando serve: «.MI» Milano, «.DE» Xetra, «.L» Londra; nessun suffisso per le borse USA), il nome per esteso, il tipo e la valuta di quotazione. Se non sei certo del ticker o della borsa, chiedilo con una domanda prima di proporre. Una vendita riguarda solo uno strumento del blocco.
- "quantity" e "pricePerUnit" sono numeri JSON positivi; il prezzo è per unità, nella valuta dello strumento. Senza quantità o senza prezzo non emettere il blocco: chiedili in prosa.
- "fees" è la commissione nella valuta dello strumento, solo se l'utente la dice.
- Uno strumento in valuta diversa dall'euro: se l'utente dice quanto gli è stato addebitato (o accreditato) in euro in totale, scrivilo in "settledTotalEur"; se non lo dice, chiedilo UNA volta con una domanda "trade:total" che ha l'opzione «Usa il cambio BCE del giorno» e "allowOther": true per scrivere il totale. Con uno strumento in euro non scrivere mai "settledTotalEur".
- Il conto: "accountId" è l'[id] del conto in euro da cui escono (o su cui entrano) i soldi, se l'utente lo nomina; se non lo nomina e i conti sono più d'uno, chiedilo con una domanda "account:"; con un conto solo usalo.
- La data è oggi, salvo che l'utente dica altro; una data futura non è ammessa.
- "withheldTaxEur" solo su una vendita e solo se l'utente dice le tasse trattenute.
- "reason" spiega in una frase quale strumento hai riconosciuto e perché.
- Un'obbligazione si propone allo stesso modo: la scheda apre il modulo dell'app, dove il prezzo è la quotazione in percentuale.
- Se il blocco STRUMENTI dice «Registro operazioni: non attivo», non proporre operazioni: scrivi che il registro si avvia da Patrimonio.
- Una rettifica di quantità non si propone: si fa da Patrimonio.
- Un'operazione muove da sola il conto che nomina: non proporre anche una riga di Cashflow per lo stesso movimento.
```

- `ASSISTANT_ROUTER_SYSTEM` (`router.ts:55-57`): the `register` line becomes «register: racconta un movimento da
  registrare — una spesa, un'entrata, uno spostamento tra conti, una rata pagata, un acquisto o una vendita di
  titoli. «oggi ho speso 40 euro al supermercato», «benzina 60», «è arrivato lo stipendio», «ho spostato 500 euro
  sul deposito», «ho comprato 10 azioni Alfa a 50 euro».»

### 4.4 The browser's references — `components/assistant/RegisterRefsContext.tsx`

`useRegisterReads` (`:44`) already reads the assets (the accounts, the properties and the loans are slices of that
read): `RegisterRefsValue` gains `trade: TradeProposalRefs` — `instruments` (`isLedgerAssetType`), `cashAssets` (the
same list `refs.cashAssets` holds), `ledgerReady` from `useAssetLedgerMeta(ownerId)` (enabled with the reads).

### 4.5 The card — `components/assistant/TradeProposalCard.tsx` (new)

The shape and the states of `ExpenseProposalCard` (same tile, same buttons, same focus rule, same saved outcome);
`MarkdownPre` (`AssistantStreamingResponse.tsx:108-113`) renders it for `block.language === TRADE_PROPOSAL_LANGUAGE
&& mode === 'register' && block.index < TRADE_PROPOSALS_MAX_PER_MESSAGE`.

- The ticker check: `useQuery({ queryKey: queryKeys.prices.quote(ticker), enabled: Boolean(proposal.newInstrument)
  && route is not known to be 'form', queryFn })` on `/api/prices/quote?ticker=` → `TickerQuote` (`found` when
  `price > 0`, else `missing`; a failed request is `missing`); `staleTime` 5 minutes. `queryKeys.prices.quote` is
  new in `lib/query/queryKeys.ts`.
- `const resolved = resolveTradeProposal(proposal, refs.trade, quote, getItalyDateIso())`.
- Lines: head «Acquisto» / «Vendita» + the instrument's name and ticker, with the chip «Nuovo strumento ·
  {TRADE_TYPE_LABELS}» when `resolved.create`; `{quantity} × {price} {currency}`; «Commissione {fee} {currency}»;
  «Totale {nativeTotal} {currency}»; the day; the account («{name}» or `PROPOSAL_NO_ACCOUNT_LABEL`); the reason. In
  another currency, under the total: `describeTradeFx(currency, fx.fxRate, fx.fxSource, date)` and «≈ {eur}» from
  `resolveTradeFx` over the proposal and `useFxRate(currency, dateIso)` (C2) — a preview, the server decides;
  `TradeFxError('total-off')` → `describeTotalOff(...)` as a problem that blocks.
- Buttons: «Conferma» (disabled with a problem, while saving, in demo, on a failed read, with a question block in
  the message — the conditions of `describeExpenseProposalState`), «Ignora». No «Modifica» on the card route.
- The write, module-level (the React Compiler: no branch inside the card's `try`):

```ts
async function writeTradeProposal(
  ownerId: string,
  resolved: ResolvedTradeProposal,
  created: { assetId?: string }
): Promise<{ transactionId: string; assetId: string; createdAsset: boolean }> {
  if (!resolved.trade) throw new Error('form route');
  let assetId = resolved.asset?.id ?? created.assetId;
  let createdAsset = false;
  if (!assetId) {
    if (!resolved.create) throw new Error('nothing to create');
    assetId = await createAsset(ownerId, resolved.create);
    // Kept for the retry: a failed purchase must not create the instrument twice.
    created.assetId = assetId;
    createdAsset = true;
  }
  const result = await createAssetTransaction(ownerId, { ...resolved.trade, assetId });
  return { transactionId: result.transactionId, assetId, createdAsset };
}
```

  On success: `recordProposal(key, { status: 'written', writtenIds })`, the toast «Operazione registrata» (with a
  new instrument: «Strumento creato e acquisto registrato»), `invalidateTradeCaches(queryClient, ownerId)`
  (`lib/hooks/useAssetTransactions.ts:60-68`) plus `queryKeys.assets.all` and `queryKeys.dashboard.overview`, then
  the PATCH. On failure with `createdRef.current.assetId` set: the error line «Strumento creato, ma l'acquisto non è
  stato registrato: {message}» and the button reads «Riprova»; `queryKeys.assets.all` is invalidated so the empty
  instrument shows in Patrimonio.
- The form route (a bond): the card shows the same lines, the note «Un'obbligazione si completa nel modulo: il
  prezzo è la quotazione» and ONE primary button «Completa nel modulo»:
  - held → `TransactionDialog` (lazy) with `asset`, `prefill={{ type, quantity, linkedCashAssetId, note }}`
    (`components/assets/TransactionDialog.tsx:131-134`) and `onCreated={(result) => written([result.transactionId])}`;
  - new → `AssetDialog` (lazy) with `initialType="bond"` (`AssetDialog.tsx:524`) and `onCreated={(assetId) =>
    written([assetId])}` — the dialog's own create flow opens the position (`:1667-1691`).
- Written state: the line «registrata» and the link «apri in Patrimonio» → `/dashboard/assets`.
- `lib/utils/tradeProposalNarrative.ts` (new): `describeTradeProposalState(resolved, saved, flags)` → `{ line,
  canConfirm, confirmLabel }`, mirroring `describeExpenseProposalState` (`expenseProposal.ts:688`): the saved states
  first («registrata», «ignorata»), then `PROPOSAL_INTERRUPTED_LINE`, the demo line, the failed-read line,
  `PROPOSAL_WAITS_FOR_ANSWER_LINE`, the first problem; `pending` disables «Conferma» without a red line.

### 4.6 The fake stream — `e2e/assistantRegister.ts`

`proposalBlock` (`:178`) gains a sibling `tradeBlock(proposal)`; `installFakeStream` (`:251`) is unchanged. The
quote service is routed by the spec (`page.route('**/api/prices/quote?*', …)`), so no test reaches Yahoo.

## 5. Constraints and traps

- **Nothing is written before «Conferma», and once** (doc/guide/assistente-registra.md): the card is the only
  writer; a reload shows the saved outcome, never a second «Conferma».
- **C2 is used IDENTICAL**: `feesNative`, `settledTotalEur`, `resolveTradeFx`, `describeTradeFx`, `useFxRate`; the
  server is the authority on the euro price — the card only previews.
- **C4**: the question card and the tail are DATI-08's; Registra's messages carry no follow-ups block beyond what
  that contract says.
- **The system prompt is static**: `REGISTER_CONTRACT` is a constant; the instruments are in the data block.
- **A ledger instrument opens EMPTY** (`quantity: 0`, no `averageCost`) and its first buy opens the position; never
  `createAsset` with the bought quantity. No `createdEmpty` (that flag is Accumulo's «Mai comprato»).
- **The server's refusals are the truth**: 409 (ledger not initialised), 422 (`SELL_EXCEEDS_HOLDING`, a future
  date), 503 (FX) come back as the error line (`describeWriteError`); the card's own checks only spare the round
  trip.
- **A probe never spends**: every test and § 7 run on the fake stream; no real model, no Yahoo.
- **Demo mode**: no write (`useDemoMode`), as every card.
- **The Modal-Is-A-Tile Rule** for the two dialogs opened from the card; `returnFocusTo` the card's button
  (CLAUDE.md § Known Issues).
- **No owner data**: «Azione Alfa» (ALFA), «ETF Beta» (BETA.MI), round figures.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| S1 | unit · `__tests__/tradeProposal.test.ts` | a valid buy on a held instrument resolves to a trade with noon of the day, the account, the fee as `fees`; both or neither of `assetId`/`newInstrument` do not parse; a sale of a new instrument does not parse | accept both |
| S2 | unit · same | a new share with a found quote → `create` with class equity, quantity 0, the quote's price and currency; quote loading → `pending`, no create; missing → the ticker problem; a ticker already held → the held instrument, `create: null`, the duplicate note | create with the bought quantity |
| S3 | unit · same | a USD instrument: `feesNative` and `settledTotalEur` on the trade, no `fees`; a EUR instrument with a total → dropped with its note | `fees` for a foreign fee |
| S4 | unit · same | a sale beyond the holding, a future day, an unknown account, a non-EUR account, the ledger off → each its problem; a bond → `route: 'form'`, `trade: null` | — per problem |
| N1 | unit · `__tests__/tradeProposalNarrative.test.ts` | the state's order: written, ignored, interrupted, demo, failed read, question pending, first problem; pending disables without a problem line | problem before saved |
| C1 | unit · `__tests__/assistantRegisterContext.test.ts` | the STRUMENTI block lists the ledger instruments with id, ticker, type, currency, quantity; a cash account is not in it | every asset |
| C2 | unit · same | ledger off → the single line, no list | list anyway |
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | the contract has «## Operazioni sui titoli» and names `trade-proposal`; the system is still equal for two users | — |
| R1 | unit · `__tests__/assistantRouter.test.ts` | the router's system names «un acquisto o una vendita di titoli» with its example | — |
| V1 | unit · `__tests__/serverValidation.test.ts` | the PATCH accepts `trade:0`, refuses `trade:x` and `other:0` | open regex |
| D1 | dom · `__tests__/tradeProposalCard.test.tsx` (new) | a held instrument: the lines, «Conferma» posts ONE trade with the resolved payload, the outcome is recorded and patched | post at render |
| D2 | dom · same | a new instrument: `createAsset` then the trade with the new id, in that order; `writtenIds` holds both | trade first |
| D3 | dom · same | quote loading → «Conferma» disabled, no red line; quote missing → the ticker problem, disabled | confirm without a quote |
| D4 | dom · same | a USD instrument shows the rate line of C2 and the euro estimate; a total 40% off the ECB rate blocks with its sentence | no check |
| D5 | dom · same | the trade rejecting after the create → the «Strumento creato, ma…» line and «Riprova»; the retry calls `createAsset` zero times more | create again |
| D6 | dom · same | a held bond → «Completa nel modulo» opens the trade form prefilled; its `onCreated` closes the card as written | — |
| D7 | dom · same | a saved `written` outcome renders the line and the link, no buttons; `ignored` likewise | buttons on a written card |
| D8 | dom · `__tests__/assistantStreamingResponse.test.tsx` | the block renders a card only on a `register` message and only the first three | card in chat |
| E1 | e2e · `e2e/assistant.register.trade.spec.ts` (new, fake SSE) | a buy on a seeded instrument: «Conferma» → the trade is in Patrimonio's «Movimenti», the account moved; reload → «registrata» | — |
| E2 | e2e · same | a new instrument (quote routed): after «Conferma» it exists in Patrimonio with the bought quantity | — |
| E3 | e2e · `e2e/assistant.register.trade.mobile.spec.ts` (new) | 390: the card has no horizontal overflow, the targets are ≥ 44 px | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the fake stream a `trade-proposal` for a held instrument shows one card and
«Conferma» records one trade; for a new instrument the card says «Nuovo strumento», creates it and records the
purchase; a USD purchase shows «EUR/USD … · dal totale dell'estratto»; a bond opens the form.

- A — the diff. B–E by a throwaway Playwright script on the emulators with `installFakeStream` (no model) at 1440
  and 390, light and dark: B a buy and a sale on held instruments; C a new instrument (quote routed: found, then
  missing), the retry after a planted trade failure; D a USD purchase with and without the total, a total far from
  the ECB rate; E a bond (held, new), demo mode, the ledger off, a reload of each written card. Decoys:
  «ornitorinco» (a `trade-proposal` in a message not read as a registration: it renders as code) and «fenicottero»
  (a fourth block in one message: code).
- F — at the owner's «pronto», on the mirror with the real model, by his hand: one purchase told in words on an
  instrument he holds and one on a new one — the mirror is removed at the end (`npm run mirror:remove`).

## 8. Putting it into service

No rules, no index: the writes are the forms'. The PATCH key's new kind is accepted by the server from this
deploy; an older client never sends it.

## 9. Documentation

- `doc/guide/assistente-registra.md` — § «Operazioni sui titoli» (the block, the card's two routes, the ticker
  check, the create-then-buy order and its retry, C2 on the card); § Files; § blind spots: a hand-priced instrument
  and an adjustment are not proposed; a bond goes through the form; the card's euro figure is a preview; the new
  instrument takes the form's defaults (edit it in Patrimonio).
- `doc/guide/assistente.md` — the router's wider `register`. `doc/guide/registro-operazioni.md` — a third writer of
  trades (the card), same route.
- `README.md` — Assistente › Registra's feature lines. `Draft Release Temp.md` — «Assistente: racconta un acquisto o
  una vendita e la scheda crea lo strumento e registra l'operazione».
- `CLAUDE.md` — Assistente line: «Registra also records a trade and creates its instrument (2026-11)», under 20.000
  characters.
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- A cash account, a property, a pension fund, a loan created from the chat → DATI-17.
- An adjustment, a hand-priced instrument, editing or deleting a trade from the chat →
  doc/guide/assistente-registra.md § blind spots.
- Several trades from a pasted statement (more than three) → doc/guide/assistente-registra.md § blind spots (the
  model proposes three and says how many remain).
- A dividend recorded from the chat → doc/guide/assistente-registra.md § blind spots.

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
  condivisi — qui C2 e C4, da usare IDENTICI —, regole della serie)
- Leggi doc/guide/assistente-registra.md, doc/guide/assistente.md, doc/guide/registro-operazioni.md,
  doc/guide/dialog.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: la proposta pura con S1–S4 e N1 (ognuno visto
rosso con la sua mutazione), la chiave e la PATCH (V1), il blocco STRUMENTI e il contratto (C1, C2,
P1, R1), i riferimenti del browser, la scheda (D1–D8), il finto flusso e E1–E3. Il codice del § 4.1 e
la funzione di scrittura del § 4.5 sono già scritti: copiali.

Fermati e chiedimi se: DATI-06 o DATI-08 non sono in develop con i contratti dell'indice, un test
arriverebbe a chiamare il modello o Yahoo, oppure la creazione di uno strumento richiede un campo che
la spec non elenca.

Collaudo: § 7 sul finto flusso; la F al mio «pronto», di mia mano. Un branch, un commit, solo dopo il
mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec: a new proposal kind that writes instruments and trades, on two
shared contracts, with a non-atomic write to hold. Estimated size: L (two pure modules, one card, the contract, the
context, ~24 tests).
