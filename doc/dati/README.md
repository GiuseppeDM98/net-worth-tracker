# `doc/dati/` — the series of 2026-11-23: the data the app keeps, and who may read and write it

> The index of the series: order, status, the owner's decisions, the shared contracts and the rules that bind every
> spec. Nineteen specs, one per implementation session, `DATI-NN-slug.md`. Written on 2026-11-23 on
> `docs/pianificazione-serie-2026-11-23` @ b0bf8276; every `file:line` in the specs is dated at that commit.
> The folder is retired with its last spec (§ 8, the retirement cycle).

## 1. The owner's points (their words, 2026-11-23)

1. «esiste una storia della serie di implementazioni che abbiamo fatto in uno dei file di documentazione per caso?
   se si a cosa serve? possiamo toglierla?»
2. «Se compro un'azione sul mercato americano, quindi la compri in dollari come la registro sull'applicazione? Se
   non esiste un modo per farlo oggi implementiamo nel modo migliore possibile»
3. «Migrare il database ad un sql lite o qualcosa di diverso da google e firebase […] Questa cosa può avere un senso
   un'utilità? […] se si passa a SQLite, userei Turso (lo uso già in altri progetti). Il confronto va fatto Firestore
   contro Turso; e il login (Firebase Auth) è una decisione a parte.»
4. «rivedere la parte di andamento in patrimonio, quel che mi interessa è vedere nell'anno quanto si è mosso lo
   strumento, mese per mese (rispetto al mese precedente) e Year to date […] possiamo pensare a qualsiasi cosa, anche
   ad un'altro tab dedicato in pagina patrimonio! […] sarebbe carino avere una visione uguale ma per come si sono
   mosse le asset allocation, sia mese su mese che year to date»
5. «ha senso registrare gli snapshot giornalieri piuttosto che quelli mensili? […] registrare invece uno snapshot
   per giorno cosa ci abilita? dove ci torna comodo? […] così magari riusciamo anche a dare info e contesto maggiori
   sui movimenti di prezzo all'assistente/consulente!»
6. «permettere all'assistente ai di creare nuovi strumenti e registrare acquisti e vendite»
7. «STRUMENTI AZZERATI — cose da migliorare»: (1) the dividend download must skip a sold-out instrument; (2) a
   total sale must fix the dividends already announced; (3) deleting must say its consequence first; (4) an orphan
   sale must keep its name; (5) «Dove mettere gli strumenti azzerati […] così non si vedono tra le posizioni vive ma
   restano consultabili con i loro movimenti».
8. «l'assistente deve poter aiutare l'utente in tutto ciò possibile, deve poter avere accesso a tutte le spese a
   livello granulare, così da capire al meglio le cose e poter dare un aiuto migliore» — with three questions he
   had asked the Assistente and the defects of the answers (too long, no single figure, apologies for plain sums,
   the prompt's jargon in the answer, fixed sections, a year-on-year question refused). The questions and the
   answers hold his data and are not in the repo.
9. «valutiamo tutte le email periodiche come sono composte e se sono utili o meno all'utente […] mi piacerebbe una
   email dove l'assistente analizza tutte le spese del periodo, a livello granulare in modo da poter suggerire dove
   e cosa tagliare nel prossimo periodo»
10. (during the session, with a screenshot) on Rendimenti the two columns of tiles do not end on one line: the
    owner wants them to, always.
11. (during the session, with a screenshot) on Previdenza the «Andamento» curve leaves its box at the top.
12. (at the end of the session) «quando compri un'obbligazione singola, non etf, in quel momento paghi il rateo di
    cedola fino ad allora accumulato a chi te la sta vendendo […] tutta questa cosa qui l'app la gestisce? l'app che
    sia quando la inserisco a mano o in futuro lo chiederò all'assistente, come potremmo gestirla al meglio»
13. (at the end of the session) «il consulente non ha accesso agli asset specifici […] in fase di creazione PAC non
    mi crea in automatico le posizioni a zero con il tasto registra quando devo comprare? […] ho anche inserito un
    ISIN, per ricordo mio, lui potrà capire che voglio comprare proprio quello e mi creerà l'asset giusto?» — and,
    after the answer, how a share he wants to buy in dollars reaches the Consulente.

## 2. What the code did when the series was written (2026-11-23; the detail in each spec § 1)

- **1** — README.md § Documentation carried three paragraphs of series history, pointed at by CLAUDE.md and
  doc/guide/collaudo.md.
- **2** — a foreign instrument's trade converts the price at the ECB rate of the day; the fee is typed in euro; no
  euro total of the statement can be entered and no rate is stored on the trade. A dividend is recorded in a
  currency typed by hand, with one withholding.
- **3** — Firestore, with the Admin SDK on the server and the client SDK in the browser, security rules, React
  Query on top; the count of the day is in DATI-01.
- **4** — Patrimonio has no tabs; the Strumenti table shows three Δ columns (month, YTD, all-time) behind a
  desktop-only toggle, each today's price against one base.
- **5** — one snapshot per month, rewritten every evening by the cron; nothing is kept per day.
- **6** — Registra proposes cashflow rows only.
- **7** — the dividend download ignores the quantity held; no ledger write touches an announced dividend; deleting
  an instrument leaves its trades orphaned and the period's sales print its id.
- **8** — the Assistente receives fixed data blocks (categories on twelve months, a monthly series by type only, no
  single row) and a prompt that forbids computing; no tool loop; the follow-up chips are static; Markdown headings
  and lists render unstyled.
- **9** — five periodic emails (monthly, quarterly, half-yearly, yearly, the Sunday budget), sent on the last day
  of the period in a UTC window, with no record of what was sent.
- **10, 11** — a column's last cell grows only on Allocazione; the sparkline is a Catmull-Rom spline that
  overshoots its data.
- **12** — no accrued interest anywhere: a bond purchase settles price and fee alone, and its first coupon counts
  whole.
- **13** — the Consulente and the Assistente read two levels of the targets; «Applica» rewrites the targets and
  erases the specific assets; the plan creates one instrument per sub-target, typed as an ETF; nothing fixes a
  listing.

## 3. The owner's decisions (2026-11-23, numbered; cited as «decision N»)

1. The series lives in `doc/dati/`, specs `DATI-NN`.
2. The series history is removed from the README entirely; the pointers are corrected; the retirement that closes
   a series writes no history any more (the standard prompt 08 in `claude-config` is updated by the owner).
3. Sold-out instruments: a closed group at the bottom of the Strumenti table, automatic (quantity 0 and operations
   in the ledger), no new field; opened, it shows the rows with «venduto il», Movimenti, Compra. «Mai comprato»
   stays among the live ones.
4. Deleting is forbidden when the instrument has operations in the ledger (the row says why); the sales already
   orphaned read «Strumento eliminato» in place of the id.
5. Foreign currency: an optional «Controvalore in euro addebitato» on the trade of a foreign instrument; the rate
   that results is saved and shown.
6. Cash accounts are in euro only: no currency field on the account's form; an existing foreign account is
   declared and is not offered as a settlement account.
7. Foreign dividends: everything — the currency from the instrument, the right labels, the rate of the payment day
   or the euro amount received, two withholdings (foreign and Italian).
8. Foreign instrument: price AND fee in its currency; «Totale addebitato in euro», all-inclusive and optional — the
   rate comes from the total and the debit matches to the cent; without it, the ECB rate of the day.
9. Database: NO migration to Turso. AGENTS.md restates the decision on today's count. No spec for it.
10. A daily archive OF ITS OWN: one document per month, one row per day, written by the cron; the monthly
    collection and its readers stay identical.
11. The archive's uses in this series: Patrimonio › Andamento (the daily chart) · the Assistente and the Consulente
    (a block of the last 30 days) · Rendimenti (volatility and drawdown on the days, declared while the data is
    thin) · Panoramica (a daily sparkline on the short periods).
12. Andamento: a new TAB «Andamento» in Patrimonio (tabs «Posizioni» | «Andamento»); the «Andamento» toggle of the
    Strumenti table is absorbed.
13. Instruments: a cell is the Price % (default), with a switch to Value € (a month with purchases or sales is
    marked, not coloured).
14. Classes: a cell is the Weight in points (default, neutral, YTD «+3,1 → 55,1%», a December column as the base),
    with a switch to Value €.
15. Phone: rows that open (the month in progress and the YTD; opened, a 4 × 3 grid of the twelve months and the
    chart).
16. The Assistente's access to the data: read-only QUERY TOOLS called by the model (totals by category and
    subcategory over any period, a monthly series, a comparison of two periods, the rows by filter); the code does
    the sums.
17. Tools also on: the budget and the cost centres · the trade ledger and the dividends · the net-worth history
    (monthly snapshots and the daily archive).
18. Form: ONE rule for everything (a verdict with one figure or a yes/no → the sums → at most two warnings; no
    fixed sections, no internal jargon, no apologies for a calculation, a caveat only when it changes the figure).
19. «Continua con»: written by the Assistente at the end of the answer (up to three); the closing offer in prose
    goes.
20. Questions back: at most ONE, as a card with options (Registra's protocol), after having answered.
21. Rules of law: a web search, the source and the year of the rule; unconfirmed → «da verificare». The router
    turns the search on.
22. The Assistente's model: Opus 5.5.
23. The Assistente creates EVERY type of instrument, with the right questions per type («se legare un mutuo ad un
    immobile, che tasso ha ecc ecc»); always a card and «Conferma».
24. Emails kept: Mensile and Annuale. Removed: Trimestrale, Semestrale, the Sunday budget.
25. A new monthly email of its own, «Revisione delle spese» (every row of the closed month, twelve months of
    comparison, the budget, three to five cuts with their figure), with its own switch.
26. Sent the day AFTER the period ends, with the period closed (and the Italian window in place of the UTC one).
27. The emails' model: Opus 5.5.
28. Daily archive: no reconstruction of the past; daily volatility and drawdown turn on with enough days and until
    then stay monthly, saying so.
29. A new instrument in a purchase: ONE card that creates the instrument and records the purchase with one
    «Conferma».
30. Announced dividends: recomputed on the quantity held the day before the ex-date at every purchase, sale or
    correction; at zero they disappear; the ones entered by hand are not touched.
31. The accrued interest of a bond (the «rateo») is handled in this series, as a spec of its own (DATI-18).
32. As the broker's statement does: the trade debits the rateo at a purchase and credits it at a sale; the coupon
    stays whole; Dividendi carries a row of its own — «Rateo pagato», negative, at the purchase, «Rateo incassato»
    at the sale — so the period's income is the coupon minus the rateo; the price of carry stays the clean price.
33. The amount is proposed by the app (the days accrued since the last coupon, net of the instrument's tax) and
    editable with the statement's figure.
34. The Consulente and the instruments the user chose on the targets: fixed in this series, one spec (DATI-19).
35. The Consulente READS the specific assets and leaves them as they are — it decides classes and sub-categories
    only; «Applica» keeps them where the sub-category stays and says what it removes.
36. An optional «Ticker o ISIN» on the lowest open level of the targets: the class without sub-categories, the
    sub-category without specific assets, each specific asset.
37. A specific asset with a ticker or an ISIN that is not held is created at 0 quotes by «Applica» and bought by
    the plan, by the weight it has in its sub-category.
38. One without ticker and ISIN that is not held stays out of the plan, said in one line.
39. In this series every spec reaches production as soon as it is implemented, and so does its retirement: the
    owner tries each novelty at once.

## 4. The adopted choices (reversible before the implementation; each is listed in full in its spec § 3)

| Spec | The adopted choices that shape it |
|---|---|
| 01 | the history is deleted, not moved; the dead index entries are not touched there |
| 02 | one document per account per month with a map of days, nested under the uid; `q` and `v` per instrument; weekends written; never persisted to IndexedDB; «Crea snapshot» writes today's row |
| 03 | the LAST cell of a column grows; the curve becomes a monotone cubic, not a larger padding |
| 04 | «held at the ex-date» = the quantity at the end of the Italian day before; the same rule for coupons; the reconciliation runs after the ledger's transaction, idempotent; the tax keeps its proportion |
| 05 | a migration baseline counts as an operation; a grouped row has no edit and no trash; the refusal is a toast |
| 06 | the stored rate is euro per unit, shown as «EUR/USD»; a 25% typing guard against the ECB rate; a read-only rate route; thirteen currencies |
| 07 | the form stays per unit; `taxAmount` stays the total; the foreign rate is proposed and remembered through the last record; the euro tax is gross minus net |
| 08 | effort `medium`; the next questions are a fenced JSON array at the very end; Registra writes none; no new type token |
| 09 | a manual streaming loop (not the SDK's runner); 8 rounds; filters by NAME; the cashflow block stays; results not saved; no eager input streaming |
| 10 | a three-day catch-up; a server-only ledger of sends that «Invia ora» ignores; a 30-minute stale claim; the dead flags stay stored |
| 11 | the verdict and the tiles are code, the model writes the cuts; «typical month» = the median of twelve; one request, no loop; a third cron at 18:30 UTC |
| 12 | the matrix reads the monthly snapshots only; a month's base is the month before, never bridged; class and name are today's; the heat scale moves to a shared file |
| 13 | 20 daily points to draw a daily line; the weight's denominator is the net worth; a property's daily price is net of its debt |
| 14 | the daily risk is ADDED beside the monthly one; 60 daily returns, √252; the return is holdings-based; the daily sparkline on «3M» only |
| 15 | the 30-day block to both, the tool for longer windows and single instruments; lazy, memoised reads; no tool on pension contributions; caps 100 trades, 120 days, 60 months |
| 16 | a new block language `trade-proposal`, 3 per message; a new instrument needs a ticker that quotes; a bond goes through the form; no adjustment from the chat |
| 17 | a third block language `asset-proposal`, 2 per message; accounts in euro; a house bought now is Compravendita's; a pension fund is born without its comparto; no «Modifica» on the card |
| 18 | the field is the statement's net amount (gross = net on the row); the two rows at the id `accrued_{tradeId}`, written in the trade's transaction; the proposal accrues to T+2 on calendar days, at the instrument's tax rate or 26%; bonds in euro only; no proposal for inflation-linked and single-coupon bonds; the rows are edited only through their trade; no backfill of past trades |
| 19 | one field, an ISIN by its shape else a Yahoo ticker; a ticker fixes listing and currency; an ISIN in a sub-category's name is read while the field is empty; the kept levels are found by name; the specific assets' weights reach the plan by contract, not by the reconcile; the new instrument's type from Yahoo's `quoteType`; no field on cash and real estate; the search ceiling stays 20 |

## 5. Order and dependencies

The number is the order. A spec is implemented only when the ones it depends on are in `develop`.

```
01 ─ documents only
02 ─ daily archive (C1) ──────────────┬─ 13 ─ 14 ─ 15
03 ─ columns and curve ───────────────┼──────── 14
04 ─ dividends at the ex-date ─┐      │
05 ─ sold-out instruments      │      │
06 ─ foreign trades (C2) ──────┼─ 07  │              ┌─ 16 ─ 17
08 ─ the answer's form (C4) ───┼──────┼─ 09 (C3) ─┬─ 11
                               │      │           └─ 15
10 ─ emails kept (C5) ← 08 ────┼──────┼─────────── 11
12 ─ Andamento, instruments (C6) ─────┴─ 13
18 ─ a bond's accrued interest ← 04, 06
19 ─ the Consulente and the chosen instruments (after 08, 09: one file in common)
```

- 07 ← 04, 06 · 09 ← 08 · 10 ← 08 · 11 ← 09, 10 · 13 ← 12, 02 · 14 ← 02, 03 · 15 ← 09, 02 · 16 ← 08, 06 · 17 ← 16 ·
  18 ← 04, 06. 19 depends on none by contract and is implemented after 08 and 09.
- **02 goes first among the code specs**: every day not collected is lost (decision 28), and three later specs
  only turn on with the days it has gathered. Like every spec of this series it reaches `main` as soon as it is
  implemented (§ 8, rule 13).

## 6. Status

| Spec | Title | Size | Depends on | Model · effort | Status |
|---|---|---|---|---|---|
| [01](DATI-01-storia-serie-e-database.md) | The series' history leaves the README; the database decision restated | S | — | Sonnet 5.5 · medium | written |
| [02](DATI-02-archivio-giornaliero.md) | The daily archive | M | — | Opus 5.5 · medium | written |
| [03](DATI-03-colonne-e-curva.md) | Two columns end on one line; a sparkline stays in its box | S | — | Sonnet 5.5 · medium | written |
| [04](DATI-04-dividendi-quantita-allo-stacco.md) | A dividend is worth what was held at the ex-date | M | — | Opus 5.5 · medium | written |
| [05](DATI-05-strumenti-azzerati.md) | Sold-out instruments: a closed group, no deletion over a history | M | — | Sonnet 5.5 · medium | written |
| [06](DATI-06-valuta-estera-operazioni.md) | A trade in a foreign currency | L | — | Opus 5.5 · medium | written |
| [07](DATI-07-valuta-estera-dividendi.md) | A dividend in a foreign currency | M | 04, 06 | Opus 5.5 · medium | written |
| [08](DATI-08-assistente-forma-della-risposta.md) | Assistente: one form for every answer | L | — | Opus 5.5 · medium | written |
| [09](DATI-09-assistente-strumenti-cashflow.md) | Assistente: tools on the cashflow, the budget, the centres | L | 08 | Opus 5.5 · medium | written |
| [10](DATI-10-email-tenute-e-giorno-dopo.md) | Periodic emails: two kept, sent the day after, once | M | 08 | Opus 5.5 · medium | written |
| [11](DATI-11-email-revisione-delle-spese.md) | The «Revisione delle spese» email | L | 09, 10 | Opus 5.5 · medium | written |
| [12](DATI-12-andamento-strumenti.md) | Patrimonio › Andamento: the instruments | L | — | Opus 5.5 · medium | written |
| [13](DATI-13-andamento-classi-e-giornaliero.md) | Andamento: the classes by weight, the daily line | M | 12, 02 | Sonnet 5.5 · medium | written |
| [14](DATI-14-rischio-giornaliero-e-sparkline.md) | Risk on the days (Rendimenti), the daily sparkline (Panoramica) | M | 02, 03 | Opus 5.5 · medium | written |
| [15](DATI-15-assistente-strumenti-patrimonio.md) | Assistente: tools on the ledger, the dividends, the net-worth history | M | 09, 02 | Opus 5.5 · medium | written |
| [16](DATI-16-registra-operazioni-e-strumenti.md) | Registra: a trade told in words, and its instrument | L | 08, 06 | Opus 5.5 · medium | written |
| [17](DATI-17-registra-conti-immobili-prestiti.md) | Registra: an account, a property, a pension fund, a loan | L | 16 | Opus 5.5 · medium | written |
| [18](DATI-18-rateo-di-cedola.md) | A bond's accrued interest: paid at the purchase, received at the sale, a row of its own | L | 04, 06 | Opus 5.5 · medium | written |
| [19](DATI-19-consulente-strumenti-voluti.md) | The Consulente reads the instruments the user chose: specific assets kept, a «Ticker o ISIN» on every leaf | L | — (after 08, 09) | Opus 5.5 · medium | written |

Status values: `written` → `read` (after the adversarial reading) → `implemented` (in `develop`, awaiting its
retirement) → the row is removed by the retirement.

## 7. Shared contracts (name, signature, file — IDENTICAL in every spec that reads them)

A contract is created by one spec and used by the later ones exactly as written. A session that finds it different
in `develop` stops and asks. A later spec may ADD to a contract (a field, an entry) and says so; it never changes
what is there.

### C1 — the daily archive (created by DATI-02; read by 13, 14, 15)

- Firestore: `dailySnapshots/{userId}/months/{YYYY-MM}` — `{ userId, month, days: Record<'DD', DailySnapshotDay> }`.
- `lib/utils/dailySnapshot.ts`:
  - `DAILY_SNAPSHOTS_COLLECTION = 'dailySnapshots'`, `DAILY_SNAPSHOTS_SUBCOLLECTION = 'months'`
  - `interface DailyAssetRow { q: number; v: number }` (quantity; value in euro)
  - `interface DailySnapshotDay { netWorth: number; liquid: number; byClass: Record<string, number>; assets: Record<string, DailyAssetRow>; at: string }`
  - `interface DailySnapshotMonth { userId: string; month: string; days: Record<string, DailySnapshotDay> }`
  - `interface DailyPoint extends DailySnapshotDay { iso: string }`
  - `buildDailySnapshotDay(input: DailySnapshotInput): DailySnapshotDay`
  - `splitIsoDay(iso): { monthKey: string; day: string }`, `monthKeysBetween(fromIso, toIso): string[]`,
    `isoDaysBefore(todayIso, days): string`
  - `flattenDailyMonths(months: DailySnapshotMonth[], fromIso, toIso): DailyPoint[]` (ascending)
  - `dailyUnitPrice(row: DailyAssetRow | undefined): number | null`
- `lib/server/dailySnapshotStore.ts`: `writeDailySnapshotDay(db, userId, isoDay, day): Promise<void>`,
  `readDailyPoints(db, userId, fromIso, toIso): Promise<DailyPoint[]>`.
- `lib/services/dailySnapshotService.ts`: `getDailySnapshotMonths(userId, monthKeys): Promise<DailySnapshotMonth[]>`.
- `lib/hooks/useDailySnapshots.ts`: `useDailySnapshots(ownerId: string | undefined, days: number)` — the last `days`
  Italian days, ascending; no read without an owner (the ONLY gate the later specs use).

### C2 — a trade in a foreign currency (created by DATI-06; read by 07, 16)

- `AssetTransaction` and its form payload gain `feesNative?: number` (the fee in the instrument's currency; `fees`
  stays its euro value) and `settledTotalEur?: number` (buy = debited, fee included; sell = credited net of the fee,
  before `withheldTaxEur`); the stored trade also `fxRate?: number` (euro per ONE unit of the currency) and
  `fxSource?: TradeFxSource`.
- `lib/utils/tradeFx.ts`: `type TradeFxSource = 'statement' | 'ecb' | 'ecb-latest'`, `interface EcbRate { rate;
  isLatest }`, `TradeFxInput`, `TradeFxResolution { priceEur; feesEur; fxRate; fxSource }`,
  `STATEMENT_RATE_TOLERANCE = 0.25`, `class TradeFxError` (`'no-rate' | 'total-off' | 'nothing-to-convert'`),
  `nativeTotal(input)`, `resolveTradeFx(input)`, `formatFxPair(currency, fxRate)` («EUR/USD 1,0961»),
  `describeTradeFx(currency, fxRate, fxSource, tradeDate)`, `describeTotalOff(currency, ecbRate)`.
- `lib/server/tradeFxService.ts`: `resolveEcbRateToEur(currency: string, date: Date): Promise<EcbRate | null>`.
- `GET /api/fx/rate?currency=&date=`; `lib/hooks/useFxRate.ts`: `useFxRate(currency | undefined, isoDay | undefined)`.
- `lib/constants/currencies.ts`: `INSTRUMENT_CURRENCIES` (thirteen codes, `as const`).
- A settlement account is in euro: the server refuses another currency.

### C3 — the Assistente's tools (created by DATI-09; extended by 15; its pure queries read by 11)

- `lib/utils/assistantExpenseQueries.ts`: `ExpenseQuery`, `GroupBy`, `GROUPS_CAP = 60`, `COMPARE_CAP = 40`,
  `ROWS_CAP = 100`, `TYPE_LABELS`, `foldName(value)`, `totalsBy(expenses, query, by, todayIso)`,
  `comparePeriods(expenses, filters, periodA, periodB, by, todayIso)`,
  `listRows(expenses, query, order, limit, todayIso, maxRows = ROWS_CAP)`, `unknownNames(asked, existing)`.
- `lib/server/assistant/tools/registry.ts`: `AssistantToolContext { userId; todayIso; now; expenses; categories;
  costCenters; budgetConfig; costCentersEnabled }`, `AssistantTool<Input>`, `class AssistantToolError`,
  `ASSISTANT_TOOLS`, `ASSISTANT_TOOL_DEFINITIONS` (ONE array, the same for every request),
  `runAssistantTool(name, rawInput, context): Promise<{ content: string; isError: boolean }>` (never throws).
- `lib/server/assistant/tools/context.ts`: `buildAssistantToolContext(userId, now)`.
- The loop in `lib/server/assistant/anthropicStream.ts`: `ASSISTANT_TOOL_ROUNDS_MAX = 8`; the status `'computing'`.
- Tools of DATI-09: `cashflow_totali`, `cashflow_confronto`, `cashflow_righe`, `budget_stato`, `centri_di_costo`.
- **Added by DATI-15**: the context's `portfolio: () => Promise<AssistantPortfolioReads>` and
  `daily: (fromIso, toIso) => Promise<DailyPoint[]>`; the tools `operazioni_registro`, `dividendi_cedole`,
  `patrimonio_storia`, `patrimonio_giorni`.
- Registra and the emails receive no tool.

### C4 — the answer's tail and the system core (created by DATI-08; read by 09, 10, 11, 15, 16, 17)

- `lib/utils/assistantAnswerTail.ts`: `FOLLOW_UPS_LANGUAGE = 'assistant-followups'`, `FOLLOW_UPS_MAX = 3`,
  `FOLLOW_UP_MAX_LENGTH = 90`, `parseFollowUps(raw): string[]`, `visibleAnswerText(content): string`,
  `splitAnswerTail(text): { body: string; followUps: string[] }`.
- `AssistantMessage.followUps?: string[]`; the stream's `done` event carries `content` and `followUps`.
- `lib/server/assistant/prompts.ts`: the rewritten `ASSISTANT_SYSTEM_CORE` (its sections are named in DATI-08 § 4)
  and `buildAssistantSystem(mode)`; the system is STATIC and byte-identical across users.
- `ASSISTANT_MODEL = 'claude-opus-5-5'`, `output_config.effort: 'medium'`.
- `components/ui/markdown-prose.tsx`: `MARKDOWN_PROSE_COMPONENTS`.
- One question card per chat message outside Registra; an email writes neither block, and its comment is
  `splitAnswerTail(comment).body`.

### C5 — the email schedule and the ledger of sends (created by DATI-10; read by 11)

- `lib/utils/emailSchedule.ts`: `type PeriodicEmailKind = 'monthly' | 'yearly'`, `interface DueEmail`,
  `EMAIL_CATCH_UP_DAYS = 3`, `monthPeriodKey(year, month)`, `lastClosedMonth(todayIso)`, `lastClosedYear(todayIso)`,
  `emailsDueOn(todayIso): DueEmail[]`, `EMAIL_CLAIM_STALE_MS`, `canClaimDelivery(existing, nowMs)`,
  `emailDeliveryId(userId, kind: string, periodKey)`.
- `lib/server/emailDeliveries.ts`: `EMAIL_DELIVERIES_COLLECTION = 'emailDeliveries'` (server-only by rule),
  `claimEmailDelivery(userId, kind, periodKey, now): Promise<boolean>`,
  `confirmEmailDelivery(userId, kind, periodKey, now, manual?)`, `releaseEmailDelivery(userId, kind, periodKey)`.
- The period's window is the Italian one (`getItalyMonthBoundsUtc`); the emails' model is
  `EMAIL_ANALYSIS_MODEL = 'claude-opus-5-5'`.

### C6 — the Andamento matrix (created by DATI-12; extended by 13; its unit price read by 15)

- `lib/utils/assetPerformanceDeltas.ts`: exported `hasNoUnitPrice(asset)` and
  `snapshotUnitPrice(row: { quantity; price; totalValue }, isProperty: boolean): number | null`.
- `lib/utils/andamentoMatrix.ts`: `type AndamentoMeasure = 'price' | 'value'`, `AndamentoCell`, `AndamentoRow`,
  `AndamentoMatrix { year; months; rows }`, `buildInstrumentMatrix({ year, assets, snapshots, trades, today })`,
  `listMatrixYears(snapshots)`, `summarizeMatrix(matrix): AndamentoSummary`.
- **Added by DATI-13**: `ClassCell`, `ClassRow`, `ClassMatrix`, `buildClassMatrix({ year, snapshots, today })`,
  `largestWeightMove(matrix)`; `lib/utils/andamentoDaily.ts`.
- The tab: `/dashboard/assets?tab=andamento`, `components/assets/AndamentoTab.tsx`, loaded on demand; the shared
  heat scale `components/ui/heatmap-scale.tsx` (`HEATMAP_STEPS`, `heatmapCellStyle`, `HeatmapLegend`).

## 8. The rules that bind every spec

1. **A spec is only a development instruction.** The session that implements it follows it as written; a doubt it
   cannot settle from the spec and this index is asked to the owner at once (AskUserQuestion), never left in code,
   documents or summary.
2. **The series' labels never enter the code**: no «DATI-07», no «C2» in a comment, a test name or a commit body's
   code reference. A comment that needs the date says «2026-11-23» or the day of the implementation.
3. **Line numbers are dated**: every `file:line` is @ b0bf8276; a later spec moves them. The function's name is the
   anchor, the line a hint.
4. **Nothing of the owner's data in a tracked file**: no figure, holding, account, family detail, pasted answer or
   screenshot. Fixtures, seeds and examples use invented round figures and generic names («ETF Alfa», «Persona A»).
5. **A probe never spends**: no test and no automated step of a guided verification calls the real model, sends a
   real email, or reaches a market-data service. The owner's phase F does, by his hand.
6. **A system prompt is static**: byte-identical across users and requests; what changes goes in the user content.
7. **Budgets**: `npm run perf:budget` — a ceiling is raised by at most 1 KB gz, with `raisedBy` and a row in
   doc/guide/velocita.md § Registro; `npm run mobile:budget` on the same build as the census, compared against
   `develop` on the same day; a spec that changes what a composed page shows first closes on both green.
8. **Tests**: Vitest green under `TZ=Europe/Rome` and `TZ=UTC`; every test of a spec's § 6 is seen red once with its
   mutation; date fixtures at noon.
9. **Documents**: tracked documents in English (Italian for quoted UI text, page names, the owner's words, the
   prompt). CLAUDE.md stays under 20.000 characters (18.920 on 2026-11-23): a fact moves to AGENTS.md or to its
   guide before a word is trimmed. DESIGN.md is amended by hand, before/after, never regenerated.
10. **Every deferral has an heir**: a later spec by number, or the named guide's § blind spots. Never «later».
11. **No series history is written anywhere** (decision 2): the specs, this index and the decisions live in
    `git log -- doc/dati/`.
12. **The cycle**: implement a spec (one branch, one commit after the owner's OK) → the NEXT session retires it
    (prompt `doc/dati/PROMPT-RITIRO.md`, created by prompt 08: its rules, files and blind spots move into the
    guides, its row leaves § 6 and its number the line of § 9, the precedents and measures of the later specs are
    updated in place) → only the session after that implements the following spec. The last retirement deletes the
    folder.
13. **`develop` → `main` after EVERY spec** (decision 39; for this series it replaces WORKFLOW.md § Where things
    are recorded, where a series reaches `main` together at its end): once a spec's phase F is closed and its
    commit is in `develop`, the owner opens the PR `develop` → `main`; its retirement goes to `main` the same way.
    So a spec is complete in production on its own — its § 8 is done at that merge, never left to a later spec —
    and the checks on the owner's production account follow each merge.
14. **Status**: § 6's column — `written`, `read`, `implemented`; a spec's own header is not edited for status.

## 9. The line for prompt 07 and prompt 08

`SERIE: doc/dati/ · INDICE: doc/dati/README.md · SPEC VIVE: 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19`

The adversarial reading of the nineteen specs together (prompt 07) is the NEXT session, before the first
implementation; prompt 08 (`08_CREA_RITIRO_SPEC`) runs after it, in a session of its own, and writes
`doc/dati/PROMPT-RITIRO.md`. A retirement removes its number from the line above; the last one deletes the line
with the folder.

## 10. What NOT to do (decided on 2026-11-23)

- **Do not migrate the database** (decision 9): no Turso, no SQLite, no abstraction layer «in case».
- **Do not rebuild the past of the daily archive** (decision 28): no backfill from the monthly snapshots or from
  price history.
- **Do not write a series history** in README.md or anywhere else (decision 2).
- **Do not add a currency to a cash account** (decision 6).
- **Do not let the Assistente write without a card and «Conferma»** (decision 23), and do not give a tool to
  Registra or to an email.
- **Do not colour** a euro change that includes flows, nor a weight in points (decisions 13, 14).
- **Do not bring back** the quarterly, the half-yearly or the Sunday budget email (decision 24).
- **Do not delete** an instrument that has operations, and do not add a trash for it (decision 4).
- **Do not put the accrued interest in the price of carry**, and do not net it from the coupon's row (decision 32).
- **Do not let the Consulente choose, rename or re-weigh the user's specific assets** (decision 35).
- **Do not hold a finished spec in `develop`** waiting for the series to end (decision 39).
- **Do not run `npm audit fix`**, and do not upgrade a dependency inside a spec's session (WORKFLOW rule 8).
- **Do not read the specs adversarially in the session that wrote them**, and do not implement before that
  reading.
