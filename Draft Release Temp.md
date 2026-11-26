# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

- **Assistente — i conti esatti sulle tue spese** — Added tools the Assistente calls to total, compare and list the recorded cashflow over any period, category or single expense, and to read the budget and the cost centres: the figures are computed by code.
- **Cashflow › Dividendi — dividendi esteri** — Added to the dividend form: the instrument's currency, «Ritenuta estera» and «Ritenuta italiana» for a foreign issuer, the ECB rate of the payment day or «Netto accreditato in euro» from the statement; a downloaded dividend is taxed at the instrument's own rate. A payment left on today's date now counts as received at once, where it showed «Attesa» until a reload.

- **Patrimonio — operazioni in valuta** — Added to «Registra operazione» on a foreign instrument: the fee in the instrument's currency, «Totale addebitato in euro» from the broker's statement, and the rate each operation used, shown in «Movimenti».
- **Patrimonio — un solo modulo per gli acquisti** — Changed «Nuovo asset»: a new instrument is created empty and «Registra operazione» opens for its first purchase; the currency is a list, and cash accounts are in euro only.

## 🐛 Bug Fixes

- **Patrimonio › Movimenti — eliminare un'operazione appena modificata** — Fixed: right after editing an operation and reloading the page, deleting it could be refused as «cambiata nel frattempo» and the operation stayed. Movimenti now waits the instant it takes to reread the list before its edit and delete buttons answer.

## 🔧 Improvements

- **Assistente — la forma delle risposte** — Changed every answer: the figure first, the sums that hold it, at most two cautions; «Continua con» is written for your question; a doubt only you can settle is one card with options; a rule of law comes with its source and year, and the Assistente now runs on Opus 5.5. An answer is formatted while it arrives and the page follows it only while you stay at the bottom, «Nuova conversazione» starts at the top, and a Registra card waits for your categories and accounts before «Conferma» and «Modifica» answer.
- **Panoramica, Patrimonio, email mensile — vendite in guadagno e in perdita** — Changed the sales sentence: when a month sells at a gain and at a loss, it names the capital gains with the tax paid on them and the losses apart, instead of a net figure beside a tax that looked larger than the gain.

- **Patrimonio — gli strumenti azzerati** — Changed Strumenti: an instrument sold in full leaves the list for a closed group at the bottom, «N strumenti azzerati», with «venduto il», «Movimenti» and «Compra»; an instrument with operations in the Registro can no longer be deleted (the trash says why), and the sales of an instrument deleted before read «Strumento eliminato».

- **Cashflow › Budget — molti budget annuali** — Improved the wide layout: «Budget annuali» spans the page with its budgets two by two, and «Tetto del mese» no longer stretches beside it, so its six-month bars keep a readable height.

## 📚 Documentation
