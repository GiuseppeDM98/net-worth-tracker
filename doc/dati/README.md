# `doc/dati/` — the series of 2026-11-23: the data the app keeps, and who may read and write it

> The index of the series: order, status, the owner's decisions, the shared contracts and the rules that bind every
> spec. Twenty-one specs, one per implementation session, `DATI-NN-slug.md`. Written on 2026-11-23 on
> `docs/pianificazione-serie-2026-11-23` @ b0bf8276; every `file:line` in the specs is dated at that commit
> (DATI-20 and DATI-21, written in the reading session: @ 94101a1c). Read adversarially on 2026-11-23: the
> corrections are in the specs, the owner's answers are decisions 40–94.
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
14. (in the reading session) «solitamente i bond singoli possono essere acquistati in lotti da 1000 (1000 euro),
    ne va tenuto conto quando si consiglia cosa acquistare e in che mese, non trovi?»
15. (in the reading session) «per alcuni BTP o simili acquistati all'emissione ti danno diritto a bonus finali o
    simili […] lo stesso btp comprato a mercato no, credo che il consulente debba tenerne conto»

## 2. What the code did when the series was written (2026-11-23; the detail in each spec § 1)

- **1** — README.md § Documentation carried three paragraphs of series history, pointed at by CLAUDE.md and
  doc/guide/collaudo.md.
- **2** — a foreign instrument's trade converts the price at the ECB rate of the day; the fee is typed in euro; no
  euro total of the statement can be entered and no rate is stored on the trade. A dividend is recorded in a
  currency typed by hand, with one withholding.
- **3** — Firestore, with the Admin SDK on the server and the client SDK in the browser, security rules, React
  Query on top; the count of 2026-11-23 is in AGENTS.md § React Query and Derived State.
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
- **10, 11** — a column's last cell grows on Allocazione, Storico, Impostazioni › Generale and Rendimenti's left
  column; not on Rendimenti's right column, Coast FIRE › Ipotesi, Impostazioni › Spese. The sparkline is a
  Catmull-Rom spline that overshoots its data.
- **12** — no accrued interest anywhere: a bond purchase settles price and fee alone, and its first coupon counts
  whole.
- **13** — the Consulente and the Assistente read two levels of the targets; «Applica» rewrites the targets and
  erases the specific assets; the plan creates one instrument per sub-target, typed as an ETF; nothing fixes a
  listing.
- **14** — a plan sizes every purchase in whole units, and a bond's unit is 1 € of nominal: «compra 138 quote».
  No lot anywhere.
- **15** — the premium at maturity is computed on everything held; a later purchase raises it; the Consulente
  does not read it.

## 3. The owner's decisions (2026-11-23, numbered; cited as «decision N»)

1. The series lives in `doc/dati/`, specs `DATI-NN`.
2. The series history is removed from the README entirely; the pointers are corrected; the retirement that closes
   a series writes no history any more (the standard prompt 08 in `claude-config` is updated by the owner).
3. Sold-out instruments: a closed group at the bottom of the Strumenti table, automatic (quantity 0 and operations
   in the ledger), no new field; opened, it shows the rows with «venduto il», Movimenti, Compra. «Mai comprato»
   stays among the live ones.
4. Deleting is forbidden when the instrument has operations in the ledger (the row says why) — but for an
   instrument whose only row is its opening position (decision 57); the sales already orphaned read «Strumento
   eliminato» in place of the id.
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

Taken in the adversarial reading (2026-11-23):

40. Bond lots (point 14): a spec of its own, DATI-20, written and read adversarially in the reading session.
41. A field on the bond, «Taglio minimo», proposed at 1.000 and editable; a bond already saved counts 1.000.
42. The plan accumulates and buys when a lot is reached, says when, and declares a bond whose share never
    reaches one.
43. By hand a warning only: the trade form never refuses a quantity.
44. The Consulente gets the lot as a fact AND the rule in its prompt.
45. In the last month a bond takes a lot from the pooled carry only when it lacks at least half a lot.
46. CLAUDE.md's «Latest» entry is REPLACED whole by every spec: the date, the spec in one sentence, «Open:
    doc/dati/ (README § 6)», «Next: DATI-NN».
47. A guide is split by sub-topic in the session of the spec that pushes it past ~500 lines (for this series, in
    place of AGENTS.md's «in a session of its own»); an AGENTS.md stub is rewritten at equal or shorter length:
    the sentence goes in the guide.
48. A verification may spend — the real model, a real email, a market-data service — only after the owner's yes,
    asked before: «quando collaudiamo qualcosa possiamo chiamare le api di anthropic o quel che ci serve per il
    collaudo, sempre chiedendomelo prima». Committed tests keep faking the model and send nothing (rule 5).
49. The daily row of a US instrument holds the price of 18:00 UTC, before the US close: accepted and declared.
50. A price that was not refreshed that day is NOT marked in the daily row: declared; C1 unchanged.
51. A coupon AND the accrued interest follow the value date (two working days after the trade); a share's
    dividend follows the trade day. DATI-04 defines the value date, DATI-18 and DATI-21 reuse it.
52. Only the automatic dividends still to be paid are recomputed: no cashflow row AND an Italian payment day
    today or later.
53. What has no market price — an account, a pension fund, a property, a loan — has no daily price: «—» in
    Prezzo %, a line in Valore € only; the Assistente reads its value alone.
54. The risk «Sui giorni» is computed on the SAME base as Rendimenti's monthly risk (the page's excluded
    instruments).
55. A ledger that cannot be read skips that user for that phase of the cron, counts the error, and is retried
    the next day.
56. No coupon and no final premium is scheduled at quantity 0; a purchase that opens a bond's position schedules
    them.
57. When the opening position is the ONLY row of the ledger, the trash deletes the instrument and that row
    together (the exception to decision 4); with any other operation the refusal stays.
58. With every instrument sold out the Strumenti table reads «Nessuno strumento in portafoglio: quelli venduti
    sono qui sotto.».
59. ONE rule for currencies: GBp becomes GBP (÷ 100 on the amounts); a currency outside the thirteen is accepted
    only when it is the one of an instrument already held; a NEW instrument in such a currency is refused from
    the chat with one line.
60. ONE form for every purchase: the asset form creates the instrument empty and opens the trade form for its
    first purchase (DATI-06); DATI-16, 18, 20 and 21 meet that one form.
61. On an older trade whose fee is in euro, a «Totale addebitato in euro» typed alone INCLUDES the fee; the
    account moves by the total, exactly.
62. The settlement account's currency is checked only when the account CHANGES; the form shows the current one
    as «(in {CUR}, non più selezionabile)».
63. Two withholdings when the instrument's ISIN does not begin with IT, whatever the currency; the conversion
    only for a currency other than the euro; an Irish ETF is proposed a foreign withholding of 0.
64. The 15% US withholding is proposed for shares only; a bond with a US ISIN is proposed 0.
65. A downloaded dividend uses the INSTRUMENT's tax rate (26% when it has none; a 0 stays 0).
66. A foreign dividend announced before DATI-07 is converted again at the rate of its payment day.
67. Registra's three starting chips stay, for Registra alone.
68. The tool loop has a deadline of 200 seconds: past it, the next round is the last.
69. The final premium (point 15): a spec of its own, DATI-21, after DATI-04 and DATI-20, written and read
    adversarially in the reading session.
70. A field on the bond, «Unità con diritto al premio», proposed at the quantity held when the premium is set; a
    later purchase never raises it; a sale lowers it when the quantity falls below it; correctable by hand.
71. The Consulente reads the premium as a fact, has a rule in its contract, and the code adds to every sale it
    proposes one sentence with the premium lost in euro; the sale is not removed.
72. A sale typed by hand prints a warning with the figure under the quantity and never blocks; after the save
    the maturity record is recomputed.
73. The cashflow tools respect the history's first year as Analisi does, and say how many rows they left out.
74. `budget_stato` for a year gives the yearly ceiling AND the ceiling to date.
75. The periodic emails get a cron of their own, and the crons run at distinct hours: snapshot and dividends
    18:00, periodic emails 19:00, the spending review 20:00 UTC. The emails' effort stays `high`.
76. The reading «Email periodiche» in Impostazioni keeps the number of recipients and the «senza destinatari»
    warning.
77. The review email's Budget tile: monthly items against the month, yearly ones against the year to date, each
    row saying its window; income goals stay out.
78. In the review email the AI's section «Dove puoi tagliare» comes AFTER the code's tiles: a declared exception
    to «the AI never first».
79. Andamento's strip on a phone has TWO cells: «Saliti» ({up} su {priced}) opens the tile, «Migliore» opens
    «Il perché».
80. The matrix «Strumenti · {year}» reads the page's instruments (no current accounts); pension funds,
    properties and loans stay, with «—» in Prezzo %.
81. The entry «patrimonio» of `perf/mobile-budget.json` is widened for the tab bar above the verdict, measured
    against `develop` on the same day, with its register row.
82. Two figures per closed row stay (decision 15): a declared exception to the First-Screen Rule.
83. The classes' weights are the snapshot's (pension funds inside their classes), declared in the method note:
    «diversamente da Storico».
84. The daily line and the «3M» sparkline share ONE threshold, 20 daily points (`MIN_DAILY_POINTS`); on a
    desktop Andamento reads the larger of the day of the year and 90 days.
85. A price written in a currency that is not the instrument's STOPS the card («Lo strumento è quotato in
    {CUR}: il prezzo che hai scritto è in {CUR2}. Correggi il prezzo.»): «Conferma» is off until the price is
    corrected on the card.
86. The accrued-interest rows STAY, unlinked, when a bond changes type and its trades are deleted in bulk — as
    the fee rows do.
87. The accrued-interest rows are dated at the trade even in a closed month, with a warning in the form.
88. The risk «Sui giorni» ALWAYS follows the chosen period, as far as the archive reaches; the label says the
    window; under 60 useful returns «giorni insufficienti»; a closed month of the archive is read at most once a
    day per device (the persisted cache lives 24 hours).
89. The Consulente's review and «Chiedi una modifica» get the strategy's constraints — in their contract, with
    the user's choices in their message — AND a guard in the code: a pinned sub-target that was renamed goes
    back to its name, one that was removed is put back.
90. The weights of the specific assets are IMPOSED by the code: the reconcile re-proportions the buy rows of one
    sub-category's specific assets to the wanted weights, their sum unchanged.
91. An instrument created from a ticker with no name of the user's takes the quote's name at the click, else
    the ticker.
92. An instrument the plan created is found again by ISIN, then ticker, then name: renaming it in Patrimonio
    does not break the link.
93. Bond lots: TWO fields, «Taglio minimo» and «Multipli di» (absent = the minimum): the plan buys the first
    lot at the minimum and then by steps.
94. After an edit or a delete of a purchase on a bond with a premium and a stored count: one line of reminder,
    «Controlla le unità con diritto al premio nella scheda dell'obbligazione.»; nothing changes by itself.

Taken with the retirement prompt (2026-11-24):

95. A spec is retired only when it is in service: its PR in `develop`, `develop` in `main`, its closing proof
    redone on the merged code, AND the owner's check on the production account that its § 8 names done and said.
    What waits for the calendar — a first automatic send, the twentieth day of the archive — is not waited for.
96. What a spec publishes by hand — the rules of DATI-02 and DATI-10, the `price-history` index DATI-02 removes —
    is published before that spec's retirement: the additive before or with the merge to `main`, the removal after
    the deploy and alone.

## 4. The adopted choices (reversible before the implementation; each is listed in full in its spec § 3)

| Spec | The adopted choices that shape it |
|---|---|
| 01 | the history is deleted, not moved; the dead index entries are not touched there |
| 02 | one document per account per month with a map of days, nested under the uid; `q` and `v` per instrument; weekends written; a closed month is persisted to IndexedDB and read at most once a day per device; «Crea snapshot» writes today's row |
| 03 | the LAST cell of a column grows; the curve becomes a monotone cubic, not a larger padding |
| 04 | «held at the ex-date» = the quantity at the end of the Italian day before — by the trade day for a share, by the value date for a coupon; the reconciliation runs after the ledger's transaction, idempotent; the tax keeps its proportion; the button still downloads a sold-out instrument's dividends and counts the ones it did not hold |
| 05 | a migration baseline counts as an operation, but alone it leaves with its instrument; a grouped row has no edit and no trash; the refusal is a toast |
| 06 | the stored rate is euro per unit, shown as «EUR/USD»; a 25% typing guard against the ECB rate; a read-only rate route; thirteen currencies and ONE rule for the others; the asset form creates empty and hands over to the trade form |
| 07 | the form stays per unit; `taxAmount` stays the total; the foreign rate is proposed and remembered through the last record; the euro tax is gross minus net |
| 08 | effort `medium`; the next questions are a fenced JSON array at the very end; Registra writes none and keeps its starting chips; no new type token; the form lives in the answer's contract, not in the core |
| 09 | a manual streaming loop (not the SDK's runner); 8 rounds or 200 seconds; filters by NAME; the cashflow block stays; results not saved; no eager input streaming; no `strict`, no cache between rounds |
| 10 | a cron of its own at 19:00 UTC; a three-day catch-up; a server-only ledger of sends that «Invia ora» ignores; a 30-minute stale claim; the dead flags stay stored; «Invia ora» refused in demo |
| 11 | the verdict and the tiles are code, the model writes the cuts; «typical month» = the median of twelve; one request, no loop; a cron of its own at 20:00 UTC |
| 12 | the matrix reads the monthly snapshots only; a month's base is the month before, never bridged; class and name are today's; the heat scale moves to a shared file; a new guide for the tab |
| 13 | 20 daily points to draw a daily line; the weight's denominator is the net worth; what has no market price has no daily price |
| 14 | the daily risk is ADDED beside the monthly one, on its base and on the chosen period; 60 daily returns, √252; the return is holdings-based; the daily sparkline on «3M» only, on Panoramica and Patrimonio; five years of days read at most |
| 15 | the 30-day block to both, the tool for longer windows and single instruments; lazy, memoised reads; no tool on pension contributions; caps 100 trades, 120 days, 60 months; a foreign dividend with no euro amount is summed apart; no E2E |
| 16 | a new block language `trade-proposal`, 3 per message; a new instrument needs a ticker that quotes; a bond goes through the form; no adjustment from the chat; the type is the model's; the card state shared with DATI-17 |
| 17 | a third block language `asset-proposal`, 2 per message; accounts in euro; a house bought now is Compravendita's; a pension fund is born without its comparto; no «Modifica» on the card; the roles are the form's; the owner on an account, a property and a personal loan |
| 18 | the field is the statement's net amount (gross = net on the row); the two rows at the id `accrued_{tradeId}`, written in the trade's transaction with everything it decides; the proposal accrues to the value date on calendar days, at the instrument's tax rate or 26%; bonds in euro only; no proposal for inflation-linked and single-coupon bonds; the rows are edited only through their trade; no backfill of past trades |
| 19 | one field, an ISIN by its shape else a Yahoo ticker; a ticker fixes listing and currency; an ISIN in a sub-category's name is read while the field is empty, in the user's saved targets only; the kept levels are found by name; the pins go to four prompts as one block; the new instrument's type from Yahoo's `quoteType` when its class is the leaf's; no field on cash and real estate; the search ceiling stays 20 |
| 20 | the lot in `BondDetails.minimumLot` and `lotStep`; it binds only where the unit's nominal is known; the rule rides on `PositionState.lot`; «holds its minimum» = held today plus bought by the plan; the recalibration spends the carry once; the sentences print no currency; the rule in the plan stage's contract only; the warning only while recording |
| 21 | absent count = everything held; only a created trade stores a missing count; the ledger never raises it; a trade settled on the maturity day or after leaves it alone; euro figures for a bond in EUR only; the service passes the stored count |

## 5. Order and dependencies

The number is the order. A spec is implemented only when the ones it depends on are in `develop`.

```
01 ─ documents only
02 ─ daily archive (C1) ──────────────┬─ 13 ─ 14 ─ 15
03 ─ columns and curve (C7) ──────────┼──────── 14
04 ─ dividends at the ex-date (C8) ─┬─ 06 ─ 07
05 ─ sold-out instruments ──────────┼──────────────────────── 15
06 ─ foreign trades (C2) ← 04 ──────┼─ 07 · 16 · 18 · 20 · 21
08 ─ the answer's form (C4) ────────┼─ 09 (C3) ─┬─ 11
                                    │           ├─ 15 ─ 18
                                    │           └─ 17
10 ─ emails kept (C5) ← 08 ─────────┼─────────── 11
12 ─ Andamento, instruments (C6) ───┴─ 13 · 15
16 ─ Registra: trades ← 08, 06, 04 ─── 17 · 19
18 ─ a bond's accrued interest ← 04, 06, 15 ─── 20 · 21
19 ─ the Consulente and the chosen instruments ← 16 ─── 20
20 ─ bond lots ← 06, 18, 19 ─── 21
21 ─ the final premium ← 04, 06, 18, 20
```

- 06 ← 04 · 07 ← 04, 06 · 09 ← 08 · 10 ← 08 · 11 ← 09, 10 · 13 ← 12, 02 · 14 ← 02, 03, 13 · 15 ← 09, 02, 12, 05, 06 ·
  16 ← 08, 06, 04 · 17 ← 16, 09 · 18 ← 04, 06, 15 · 19 ← 16 (and after 08, 09, 15: files in common) · 20 ← 06, 18,
  19 · 21 ← 04, 06, 18, 20.
- **02 goes first among the code specs**: every day not collected is lost (decision 28), and three later specs
  only turn on with the days it has gathered. Like every spec of this series it reaches `main` as soon as it is
  implemented (§ 8, rule 13).

## 6. Status

| Spec | Title | Size | Depends on | Model · effort | Status |
|---|---|---|---|---|---|
| [07](DATI-07-valuta-estera-dividendi.md) | A dividend in a foreign currency | M | 04, 06 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 25 rilievi, 4 decisioni |
| [08](DATI-08-assistente-forma-della-risposta.md) | Assistente: one form for every answer | L | — | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 25 rilievi, 1 decisione |
| [09](DATI-09-assistente-strumenti-cashflow.md) | Assistente: tools on the cashflow, the budget, the centres | L | 08 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 25 rilievi, 3 decisioni |
| [10](DATI-10-email-tenute-e-giorno-dopo.md) | Periodic emails: two kept, sent the day after, once | M | 08 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 20 rilievi, 2 decisioni |
| [11](DATI-11-email-revisione-delle-spese.md) | The «Revisione delle spese» email | L | 09, 10 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 25 rilievi, 2 decisioni |
| [12](DATI-12-andamento-strumenti.md) | Patrimonio › Andamento: the instruments | L | — | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 29 rilievi, 5 decisioni |
| [13](DATI-13-andamento-classi-e-giornaliero.md) | Andamento: the classes by weight, the daily line | M | 12, 02 | Sonnet 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 28 rilievi, 3 decisioni |
| [14](DATI-14-rischio-giornaliero-e-sparkline.md) | Risk on the days (Rendimenti), the daily sparkline (Panoramica) | M | 02, 03, 13 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 22 rilievi, 3 decisioni |
| [15](DATI-15-assistente-strumenti-patrimonio.md) | Assistente: tools on the ledger, the dividends, the net-worth history | M | 09, 02, 12, 05, 06 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 26 rilievi, 1 decisione |
| [16](DATI-16-registra-operazioni-e-strumenti.md) | Registra: a trade told in words, and its instrument | L | 08, 06, 04 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 30 rilievi, 3 decisioni |
| [17](DATI-17-registra-conti-immobili-prestiti.md) | Registra: an account, a property, a pension fund, a loan | L | 16, 09 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 19 rilievi, 0 decisioni |
| [18](DATI-18-rateo-di-cedola.md) | A bond's accrued interest: paid at the purchase, received at the sale, a row of its own | L | 04, 06, 15 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 21 rilievi, 3 decisioni |
| [19](DATI-19-consulente-strumenti-voluti.md) | The Consulente reads the instruments the user chose: specific assets kept, a «Ticker o ISIN» on every leaf | L | 16 (after 08, 09, 15) | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 21 rilievi, 4 decisioni |
| [20](DATI-20-lotto-minimo-obbligazioni.md) | A single bond is bought and sold in lots: the plan waits for a whole lot, the Consulente knows it | L | 06, 18, 19 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 22 rilievi, 1 decisione |
| [21](DATI-21-premio-finale-obbligazioni.md) | A bond's final premium is owed on the units bought at issue: the app counts them, the Consulente knows it | M | 04, 06, 18, 20 | Opus 5.5 · medium | read — riletta in modo adversariale il 2026-11-23: 22 rilievi, 1 decisione |

Status values: `written` → `read` (after the adversarial reading) → `implemented` (in `develop`, awaiting its
retirement) → the row is removed by the retirement.

Still to be seen in production after a retirement (the calendar's, never waited for): 04 — the stale pending records
written before the deploy, corrected one by one on their payment day or at their asset's next trade.

## 7. Shared contracts (name, signature, file — as this section states them, in every spec that reads them)

A contract is created by one spec and used by the later ones as written here. A session that finds it different
in `develop` stops and asks. A later spec may ADD to a contract (a field, an entry, an argument at the end) and
says so; it never changes what is there. The full text of each is in the spec that creates it.

### C1 — the daily archive (created by DATI-02; extended by 13; read by 13, 14, 15)

- Firestore: `dailySnapshots/{userId}/months/{YYYY-MM}` — `{ userId, month, updatedAt: Timestamp, days:
  Record<'DD', DailySnapshotDay> }`.
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
  - `dailyUnitPrice(row: DailyAssetRow | undefined): number | null` — null without a positive quantity or with a
    negative value; the caller excludes what has no market price (`hasNoMarketPrice`, C6; decision 53)
  - `isDailyMonthFinal(monthKey, fetchedOnIso): boolean`
  - **Added by DATI-13**: `MIN_DAILY_POINTS = 20` (read by 13 and 14).
- `lib/server/dailySnapshotStore.ts`: `writeDailySnapshotDay(db, userId, isoDay, day): Promise<void>`,
  `readDailyPoints(db, userId, fromIso, toIso): Promise<DailyPoint[]>`.
- `lib/services/dailySnapshotService.ts`: `getDailySnapshotMonths(userId, monthKeys): Promise<DailySnapshotMonth[]>`,
  `getDailySnapshotMonth(userId, monthKey): Promise<DailySnapshotMonth | null>`.
- `lib/query/queryKeys.ts`: `queryKeys.dailySnapshots.all(userId)`, `.month(userId, monthKey)`; the prefix is
  persisted, a closed month never goes stale.
- `lib/hooks/useDailySnapshots.ts`: `useDailySnapshots(ownerId: string | undefined, days: number):
  DailySnapshotsResult` — `{ data: DailyPoint[] | undefined; isPending; isError }`, NOT a query: the last `days`
  Italian days, ascending, one query per month; no read without an owner (the ONLY gate the later specs use).

### C2 — a trade in a foreign currency (created by DATI-06; read by 07, 16, 18)

- `AssetTransaction` and its form payload gain `feesNative?: number` (the fee in the instrument's currency; `fees`
  stays its euro value) and `settledTotalEur?: number` (buy = debited, fee included; sell = credited net of the fee,
  before `withheldTaxEur`); the stored trade also `fxRate?: number` (euro per ONE unit of the currency) and
  `fxSource?: TradeFxSource`. `AssetTransactionUpdateData`: `null` removes a field.
- `lib/utils/tradeFx.ts`: `type TradeFxSource = 'statement' | 'ecb' | 'ecb-latest'`, `interface EcbRate { rate;
  isLatest }`, `TradeFxInput` (with `legacyFeesEur`), `TradeFxResolution { priceEur; feesEur; fxRate; fxSource }`,
  `STATEMENT_RATE_TOLERANCE = 0.25`, `class TradeFxError` (`'no-rate' | 'total-off' | 'nothing-to-convert'`),
  `nativeTotal(input)`, `resolveTradeFx(input)`, `formatFxPair(currency, fxRate)` («EUR/USD 1,0961»),
  `describeTradeFx(currency, fxRate, fxSource, tradeDate)`, `describeTotalOff(currency, ecbRate)`.
- `lib/server/tradeFxService.ts`: `resolveEcbRateToEur(currency: string, date: Date): Promise<EcbRate | null>`.
- `GET /api/fx/rate?currency=&date=`; `lib/hooks/useFxRate.ts`: `useFxRate(currency | undefined, isoDay | undefined)`.
- `lib/constants/currencies.ts`: `INSTRUMENT_CURRENCIES` (thirteen codes, `as const`), `InstrumentCurrency`,
  `isListedCurrency`, `normalizeCurrencyAmount(currency, amount)`, `isCurrencyAllowed(currency,
  instrumentCurrency?)` — the ONE rule of decision 59, read by 07 and 16.
- `TradeMutationResult` and the client's `AssetTransactionMutationResult` gain `priceEur` and `feesEur`.
- ONE form (decision 60): `AssetDialog` creates the instrument empty, re-reads it and calls
  `onRegisterTrade(created)`; `TransactionDialog` records the first purchase. Read by 16, 18, 20, 21.
- A settlement account is in euro: the server refuses another currency when the account changes.
- As built (2026-11-25), every signature above unchanged. Beside them: `useFxRate` keys `queryKeys.fx.rate(currency,
  isoDay)` (not persisted); the ledger create of `AssetDialog` re-reads the meta at submit and, when it is truly
  absent, creates the instrument at 0 units by the classic path, with no trade form; `fetchMarketPrice(…, { silent })`
  serves the ticker's lookup; the guides: doc/guide/registro-operazioni.md § A trade in a foreign currency,
  doc/guide/patrimonio-strumenti.md, doc/guide/server.md.

### C3 — the Assistente's tools (created by DATI-09; extended by 15 and 18; read by 11, 15, 17)

- `lib/utils/assistantExpenseQueries.ts`: `ExpenseQuery`, `GroupBy`, `QueryClock { todayIso; floorIso }`,
  `queryClockOf(todayIso, cashflowHistoryStartYear)`, `GROUPS_CAP = 60`, `COMPARE_CAP = 40`, `ROWS_CAP = 100`,
  `TYPE_LABELS`, `foldName(value)` (read by 17), `totalsBy(expenses, query, by, clock)`,
  `comparePeriods(expenses, filters, periodA, periodB, by, clock)`,
  `listRows(expenses, query, order, limit, clock, maxRows = ROWS_CAP)`, `unknownNames(asked, existing)` — the last
  argument of the three queries is the CLOCK, read so by DATI-11.
- `lib/server/assistant/tools/registry.ts`: `AssistantToolContext { userId; todayIso; now; clock; expenses;
  categories; costCenters; budgetConfig; costCentersEnabled }` (a failed read of the centres or the budget is
  `'unreadable'`), `AssistantTool`, `class AssistantToolError`, `defineAssistantTool({ name, description, input,
  run })`, `ASSISTANT_TOOLS`, `ASSISTANT_TOOL_DEFINITIONS` (ONE array, the same for every request of a turn),
  `runAssistantTool(name, rawInput, context): Promise<{ content: string; isError: boolean }>` (never throws).
- `lib/server/assistant/tools/context.ts`: `readAssistantTurnData(userId, now)` → `{ toolContext, cashflowBlock }`,
  `buildAssistantToolContext(userId, now)`. `lib/server/assistant/tools/budgetState.ts`:
  `computeBudgetState(input, context)` (read by 11).
- The loop in `lib/server/assistant/anthropicStream.ts`: `ASSISTANT_TOOL_ROUNDS_MAX = 8`,
  `ASSISTANT_TOOL_DEADLINE_MS = 200_000`; the status `'computing'`; the return carries `toolCalls` and
  `toolRounds`.
- Tools of DATI-09: `cashflow_totali`, `cashflow_confronto`, `cashflow_righe`, `budget_stato`, `centri_di_costo`.
- **Added by DATI-15**: the context's `portfolio: () => Promise<AssistantPortfolioReads>`,
  `daily: (fromIso, toIso) => Promise<DailyPoint[]>` and `includeDummySnapshots`; an `options` argument at the
  end of `readAssistantTurnData` and `buildAssistantToolContext`; `toolNames` in the loop's return; the tools
  `operazioni_registro`, `dividendi_cedole`, `patrimonio_storia`, `patrimonio_giorni`;
  `lib/utils/assistantPortfolioQueries.ts` (`listTrades`, `TradeLine`, `dividendTotals`, …).
- **Added by DATI-18**: `TradeLine.accruedEur`, and one sentence in the descriptions of `operazioni_registro` and
  `dividendi_cedole`.
- Registra and the emails receive no tool.

### C4 — the answer's tail and the system core (created by DATI-08; read by 09, 10, 15, 16, 17)

- `lib/utils/assistantAnswerTail.ts`: `FOLLOW_UPS_LANGUAGE = 'assistant-followups'`, `FOLLOW_UPS_MAX = 3`,
  `FOLLOW_UP_MAX_LENGTH = 90`, `REGISTER_STARTER_FOLLOW_UPS`, `parseFollowUps(raw): string[]`,
  `visibleAnswerText(content): string`, `splitAnswerTail(text): { body: string; followUps: string[] }`,
  `answerFollowUps`.
- `AssistantMessage.followUps?: string[]`; the stream's `done` event carries `content` and `followUps`.
- `lib/server/assistant/prompts.ts`: the rewritten `ASSISTANT_SYSTEM_CORE`, `ANSWER_CONTRACT` (the answer's form:
  Registra and the emails do not read it), `PERIOD_LINES`, and `buildAssistantSystem(mode)`; the system is STATIC
  and byte-identical across users.
- `ASSISTANT_MODEL = 'claude-opus-5-5'`, `output_config.effort: 'medium'`.
- `components/ui/markdown-prose.tsx`: `MARKDOWN_PROSE_COMPONENTS`.
- One question card per chat message outside Registra (`keepQuestionBlock(ordinal, mode)`); an email writes
  neither block.
- The E2E fake stream's reply is `{ text, reading, followUps?, statuses? }`.

### C5 — the email schedule and the ledger of sends (created by DATI-10; extended by 11)

- `lib/utils/emailSchedule.ts`: `type PeriodicEmailKind = 'monthly' | 'yearly'`, `interface DueEmail`,
  `EMAIL_CATCH_UP_DAYS = 3`, `monthPeriodKey(year, month)`, `lastClosedMonth(todayIso)`, `lastClosedYear(todayIso)`,
  `emailsDueOn(todayIso): DueEmail[]`, `type EmailDeliveryStatus = 'sending' | 'sent'`, `EMAIL_CLAIM_STALE_MS`,
  `canClaimDelivery(existing, nowMs)`, `emailDeliveryId(userId, kind: string, periodKey)`.
- `lib/server/emailDeliveries.ts`: `EMAIL_DELIVERIES_COLLECTION = 'emailDeliveries'` (server-only by rule),
  `claimEmailDelivery(userId, kind, periodKey, now): Promise<boolean>`,
  `confirmEmailDelivery(userId, kind, periodKey, now, manual?)`, `releaseEmailDelivery(userId, kind, periodKey)`.
- `lib/server/emailHtml.ts`: `emailAppLink(appUrl)` (read by 11).
- The cron of the periodic emails: `/api/cron/periodic-emails`, `0 19 * * *` UTC.
- The period's window is the Italian one (`getItalyMonthBoundsUtc`); the emails' model is
  `EMAIL_ANALYSIS_MODEL = 'claude-opus-5-5'`.
- **Added by DATI-11**: `SPENDING_REVIEW_KIND = 'spending-review'`, `spendingReviewDueOn(todayIso)`; the cron
  `/api/cron/spending-review`, `0 20 * * *` UTC.

### C6 — the Andamento matrix (created by DATI-12; extended by 13; read by 13, 15)

- `lib/utils/assetPerformanceDeltas.ts`: exported `hasNoMarketPrice(asset)` (an account, a pension fund, a loan, a
  property: read by 13 and 15) and `snapshotUnitPrice(row: { quantity; price; totalValue }): number | null`.
- `lib/utils/andamentoMatrix.ts`: `type AndamentoMeasure = 'price' | 'value'`, `AndamentoCell`, `AndamentoRow`,
  `AndamentoMatrix { year; months; rows }`, `buildInstrumentMatrix({ year, assets, snapshots, trades, today })`,
  `listMatrixYears(snapshots)`, `summarizeMatrix(matrix): AndamentoSummary`.
- `lib/utils/andamentoNarrative.ts`: `buildAndamentoVerdict(summary, rows, year, isCurrentYear)`,
  `selectAndamentoStrip(summary, tileId)`. `lib/utils/assetsTabs.ts`: `ASSETS_TAB_IDS`, `AssetsTabId`,
  `getInitialTab`.
- The tab: `/dashboard/assets?tab=andamento`, `components/assets/AndamentoTab.tsx` (`AndamentoTabProps`), loaded
  on demand; the shared heat scale `components/ui/heatmap-scale.tsx` (`HEATMAP_STEPS`, `heatmapCellStyle`,
  `HeatmapLegend`).
- **Added by DATI-13**: `ClassCell`, `ClassRow`, `ClassMatrix`, `buildClassMatrix({ year, snapshots, today })`,
  `largestWeightMove(matrix)`, `buildClassVerdict`, `selectClassStrip(matrix, tileId)`;
  `lib/utils/andamentoDaily.ts`. **Changed by DATI-13, and said in both specs**: `AndamentoTabProps` gains
  `ownerId`; `AndamentoLineProps` is replaced.

### C7 — the column that ends on one line, the curve that stays in its box (created by DATI-03; read by 14)

- `components/ui/tile.tsx`: `TILE_COLUMN_CLASS`, `TILE_COLUMN_END_CLASS`, the attribute `data-tile-column`.
- `lib/utils/sparklinePath.ts`: `SparkPoint`, `SparkSegment`, `monotoneSegments(pts)`, `monotonePath(pts): string`.
- `e2e/tileColumns.ts`: `expectColumnsEndTogether`, `forceColumnTaller`, `expectLastFooterOnEdge`.

### C8 — what a dividend is owed on (created by DATI-04; extended by 07, 18, 21; read by 06, 16, 18, 21)

- `lib/utils/dividendEntitlement.ts`: `SETTLEMENT_LAG_DAYS = 2`, `settlementDayIso(tradeDayIso)` (the value date:
  read by 18 and 21, never copied), `type EntitlementBasis = 'trade' | 'settlement'`,
  `entitlementBasisOf(dividendType)`, `quantityHeldBefore(trades, exDate, basis)`,
  `entitledQuantity(assetQuantity, trades, exDate, basis)`, `canBeOwedSince(assetQuantity, trades, windowStart)`,
  `EntitlementVerdict`, `AnnouncedDividend`, `reconcileAnnouncedDividend(dividend, trades, asOfIso)`;
  `AnnouncedDividendsOutcome` and `describeAnnouncedDividendsOutcome` live in `lib/utils/announcedDividendsOutcome.ts`
  (the light module the trade dialogs import) and are re-exported here (aligned with the code on 2026-11-24).
- `lib/server/dividendEntitlementService.ts`: `reconcileAnnouncedDividendsForAsset(ownerId, assetId)`;
  `lib/server/assetAdminRepository.ts`: `getAssetTransactionsForAssetAdmin(userId, assetId)`;
  `TradeMutationResult.announcedDividends`.
- `lib/services/couponScheduling.ts`: `scheduleCouponsForOpenedPosition({ asset, quantityBefore, quantityAfter,
  userId })` — called by the trade form after a purchase that opens a bond's position; DATI-16 calls it at the
  card's confirmation.
- Three later specs extend the module, in this order, each adding and none rewriting: **DATI-07**
  `foreignTaxAmount` on `AnnouncedDividend` and on the `update` verdict; **DATI-18** the guard, as the function's
  first line, that an `'accrued'` row is never a candidate; **DATI-21** a fourth optional argument,
  `premiumQuantity`, that caps a `'finalPremium'` record.

### Other names one spec creates and a later one reads

- `DELETED_INSTRUMENT_NAME` (`lib/utils/deletedInstrumentName.ts`, re-exported by `lib/utils/instrumentArchive.ts`; DATI-05 retired) — read by 15.
- `invalidateTradeCaches` (`lib/hooks/useAssetTransactions.ts`) — widened by DATI-04 (the dividends' keys), exported
  by DATI-16.
- `describeProposalCardState` (`lib/utils/proposalCardState.ts`) and the exported `isCalendarDate`
  (`lib/utils/expenseProposal.ts`), DATI-16 — read by 17.
- `LEDGER_TYPE_CLASS` (`lib/utils/tradeProposal.ts`, DATI-16) — read by 19.
- `OperatingPlanInstrument.wanted`, the facts row whose last part is the wanted weight, and the reconcile's
  seventeen rules (DATI-19) — read by 20 and 21.
- `lib/utils/bondLot.ts` (`LotRule`, `lotRuleOf`, `sellableUnits`, `describeLotWarning`), `OperatingPlanInstrument.lot`
  and the lot branch of the reconcile's sixth step (DATI-20) — read by 21, which writes that step whole.

## 8. The rules that bind every spec

1. **A spec is only a development instruction.** The session that implements it follows it as written; a doubt it
   cannot settle from the spec and this index is asked to the owner at once (AskUserQuestion), never left in code,
   documents or summary.
2. **The series' labels never enter the code**: no «DATI-07», no «C2» in a comment, a test name or a commit body's
   code reference. A comment that needs the date says «2026-11-23» or the day of the implementation.
3. **Line numbers are dated**: every `file:line` is @ b0bf8276 (DATI-20 and DATI-21: @ 94101a1c); a later spec
   moves them. The function's name is the anchor, the line a hint.
4. **Nothing of the owner's data in a tracked file**: no figure, holding, account, family detail, pasted answer or
   screenshot. Fixtures, seeds and examples use invented round figures and generic names («ETF Alfa», «Persona A»).
5. **A probe spends only with the owner's yes** (decision 48): no committed test calls the real model or sends a
   real email — they fake the model, as today; a step of a guided verification that would call the real model,
   send a real email or reach a paid service is ASKED to the owner before it runs, each time. The owner's phase F
   spends by his hand.
6. **A system prompt is static**: byte-identical across users and requests; what changes goes in the user content.
7. **Budgets**: `npm run perf:budget` — a ceiling is raised by at most 1 KB gz, with `raisedBy` and a row in
   doc/guide/velocita.md § Registro; `npm run mobile:budget` on the same build as the census, compared against
   `develop` on the same day; a spec that changes what a composed page shows first closes on both green.
8. **Tests**: Vitest green under `TZ=Europe/Rome` and `TZ=UTC`; every test of a spec's § 6 is seen red once with its
   mutation; date fixtures at noon.
9. **Documents**: tracked documents in English (Italian for quoted UI text, page names, the owner's words, the
   prompt). CLAUDE.md stays under 20.000 characters, counted with `node` (18.660 on 2026-11-23): an area's line is
   rewritten at equal or shorter length, and a fact moves to AGENTS.md or to its guide before a word is trimmed.
   DESIGN.md is amended by hand, before/after, never regenerated.
10. **Every deferral has an heir**: a later spec by number, or the named guide's § Per-page blind spots. Never
    «later».
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
    and the checks on the owner's production account follow each merge and precede the spec's retirement
    (decision 95).
14. **Status**: § 6's column — `written`, `read`, `implemented`; a spec's own header is not edited for status.
15. **CLAUDE.md's «Latest» is replaced, never extended** (decision 46): each spec writes the date, itself in one
    sentence, «Open: doc/dati/ (README § 6)» and «Next: DATI-NN»; the last one names the retirement.
16. **Guides and stubs** (decision 47): a guide a spec pushes past ~500 lines is split by sub-topic in that
    spec's session; an AGENTS.md § 3 stub is rewritten at equal or shorter length, the new sentence lives in the
    guide.

## 9. The line for prompt 07 and prompt 08

`SERIE: doc/dati/ · INDICE: doc/dati/README.md · SPEC VIVE: 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21`

The adversarial reading of the specs together (prompt 07) was done on 2026-11-23, with DATI-20 and DATI-21
written and read in it; prompt 08 (`08_CREA_RITIRO_SPEC`) ran on 2026-11-24, in a session of its own, and wrote
`doc/dati/PROMPT-RITIRO.md`; DATI-01 to DATI-06 were implemented and retired (01–04 on 2026-11-24, 05 and 06 on 2026-11-25); the next spec is DATI-07. A retirement removes its number from the line
above; the last one deletes the line with the folder.

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
- **Do not delete** an instrument that has operations — its opening position alone excepted — and do not add a
  trash for it (decisions 4, 57).
- **Do not put the accrued interest in the price of carry**, and do not net it from the coupon's row (decision 32).
- **Do not let the Consulente choose, rename or re-weigh the user's specific assets** (decisions 35, 89, 90).
- **Do not refuse a trade for its lot or its premium**: by hand the app warns and saves (decisions 43, 72).
- **Do not raise the units entitled to a final premium from the ledger** (decision 70).
- **Do not hold a finished spec in `develop`** waiting for the series to end (decision 39).
- **Do not run `npm audit fix`**, and do not upgrade a dependency inside a spec's session (WORKFLOW rule 8).
- **Do not spend in a verification without asking first** (decision 48).
- **Do not read the specs adversarially in the session that wrote them**, and do not implement before that
  reading — DATI-20 and DATI-21 excepted, written and read in the reading session by decisions 40 and 69.
