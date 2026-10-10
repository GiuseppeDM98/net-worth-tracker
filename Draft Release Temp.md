# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

- **Hall of Fame (telefono e tablet)** — Added the small-screen composition of the page: under the title only the first sentence of the verdict («In quel mese il patrimonio è salito di +8000 €, il +4,1% in un mese.»), then three figures to tap — «Quest'anno», «Entrate record», «Risparmio record» — each opening the tile that explains it, then Record del patrimonio open with its chart lower, then «Il resto della pagina»: Entrate, Risparmio record, Anni and Note as closed rows that say in words what they hold («per mese», «3 note») and open with a tap; «Il perché · l'anno e il mese in corso» opens the rest of the verdict. The rows you open are remembered on that device; «Apri tutte» opens them all. The two actions «Aggiungi una nota» and «Aggiorna i record» moved to the end of the page. On a desktop nothing changes but the verdict's punctuation: the running year and month are now a second sentence.

- **Patrimonio › Prestiti** — Added a «Prestito» asset: a debt of its own, worth minus what you still owe — a mortgage linked to the property it finances, or a personal loan. The property keeps its gross value and the mortgage sits beside it in the Immobili class; a personal loan is negative liquidity, read «debito» among your accounts.
- **Patrimonio › Prestiti** — Added the automatic move of a mortgage recorded the old way (a field of the property) into a loan the first time you open Patrimonio, with its linked instalments following it and the net worth unchanged.
- **Patrimonio › Mutuo** — Added one «Mutuo» tile per loan («Prestito» for a personal one): the interest and principal paid this year, the debt, when the plan ends; a loan repaid in full reads «Estinto».
- **Patrimonio › Obbligazioni** — Added the bond with a single coupon paid with the redemption («Unica a scadenza», the BTP Valore Insieme): the annual rate compounds over the bond's life, the form previews the figure to check against the issuer's sheet, and the one coupon lands on the maturity date.

- **Cashflow › Nuova voce** — Added the «Commissione» field on every entry, not only on a transfer: the bank fee becomes a spending row of its own in the category chosen in Impostazioni › Spese («Commissioni bancarie»), on the same account and date, edited from its entry and deleted with it; on a recurring series or an instalment plan every occurrence gets its own fee.
- **Cashflow › Nuova voce** — Added «Estinzione anticipata» on a Debt entry that repays a loan: the whole amount goes to principal, partial or total, and the line under the field says the debt it leaves («da 10.000 € a 6.000 €»); a penalty goes in the fee.
- **Cashflow › Nuova voce** — Added a transfer that lands on a property: the deposit on a house you are buying leaves the account and becomes value of the house, nothing counts as spending.

## 🐛 Bug Fixes

- **Cashflow › Movimenti (tabella)** — Fixed the deletion of a whole series from the table view, which left the fees' debits on the account; the feed already gave them back.

## 🔧 Improvements

- **Cashflow · FIRE e Simulazioni · Impostazioni (telefono e tablet)** — Improved the section pill under the title: every tab is now a 44-pixel target for the thumb, so the pill is a little taller.
- **Ogni pagina** — Improved the figures in every verdict and reading: the «€» now sits right after its number («+1.200 €» instead of a whole monospace cell of space between them), on the phone's figure strip too.

- **FIRE** — Improved the FIRE number: the loan on an excluded primary residence is left out with the house, so a debt on a thing not counted never lowers the figure.
- **Storico › Driver** — Improved «mutuo»: a month that opens a loan shows the debt going up and one that closes it shows it repaid.
- **Rendimenti** — Improved the base: a loan is out of every performance base, whatever the toggles say.
- **Impostazioni › Spese** — Improved the fee tile, now «Commissioni bancarie», saying that the category serves every entry and every occurrence of a series.
