# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

- **Patrimonio — operazioni in valuta** — Added to «Registra operazione» on a foreign instrument: the fee in the instrument's currency, «Totale addebitato in euro» from the broker's statement, and the rate each operation used, shown in «Movimenti».
- **Patrimonio — un solo modulo per gli acquisti** — Changed «Nuovo asset»: a new instrument is created empty and «Registra operazione» opens for its first purchase; the currency is a list, and cash accounts are in euro only.

## 🐛 Bug Fixes

- **Patrimonio › Movimenti — eliminare un'operazione appena modificata** — Fixed: right after editing an operation and reloading the page, deleting it could be refused as «cambiata nel frattempo» and the operation stayed. Movimenti now waits the instant it takes to reread the list before its edit and delete buttons answer.

## 🔧 Improvements

- **Panoramica, Patrimonio, email mensile — vendite in guadagno e in perdita** — Changed the sales sentence: when a month sells at a gain and at a loss, it names the capital gains with the tax paid on them and the losses apart, instead of a net figure beside a tax that looked larger than the gain.

- **Patrimonio — gli strumenti azzerati** — Changed Strumenti: an instrument sold in full leaves the list for a closed group at the bottom, «N strumenti azzerati», with «venduto il», «Movimenti» and «Compra»; an instrument with operations in the Registro can no longer be deleted (the trash says why), and the sales of an instrument deleted before read «Strumento eliminato».

## 📚 Documentation
