# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

## 🐛 Bug Fixes

- **Patrimonio › Movimenti — eliminare un'operazione appena modificata** — Fixed: right after editing an operation and reloading the page, deleting it could be refused as «cambiata nel frattempo» and the operation stayed. Movimenti now waits the instant it takes to reread the list before its edit and delete buttons answer.

## 🔧 Improvements

- **Patrimonio — gli strumenti azzerati** — Changed Strumenti: an instrument sold in full leaves the list for a closed group at the bottom, «N strumenti azzerati», with «venduto il», «Movimenti» and «Compra»; an instrument with operations in the Registro can no longer be deleted (the trash says why), and the sales of an instrument deleted before read «Strumento eliminato».

## 📚 Documentation
