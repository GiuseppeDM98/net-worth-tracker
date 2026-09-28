# Draft release notes

> Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its final state.

## ✨ New Features

- Added an optional reading of Analisi › Flusso by 50/30/20 role (Necessità · Desideri · Risparmi): switch it on in Impostazioni › Spese, give each spending category a role (a subcategory can override it), and the Flusso opens on «Per ruolo» with «Per tipo» one tap away. What has no role yet reads «Da classificare», a period that spent more than it earned shows the gap as «Coperto dal patrimonio», and when some spending is itself a saving the reading says how much was set aside and how much was left over. (Contributed by Ciocc128.)

- Added, in Cashflow › Divisione, the income left «In comune» paying the shared spending first: a refund on a shared bill or a salary nobody attributed comes off the pool before the shares, the «In comune» tile shows it under its figure («Entrate in comune −300 €», «Da dividere 2110 €») and the verdict says it in the same sentence («le spese in comune sono 2410 €, meno 300 € di entrate in comune: 2110 € da dividere, 1266 € a Giuseppe (60%)…»); when the shared income covers the shared spending whole the surplus is stated («avanzano 100 €») rather than handed out. The shares now come from every income attributed to a person whatever its category, so the tab no longer depends on the categories marked as labor income and says «entrate» where it said «stipendio» («Registra le entrate di Marcella in Tracciamento e intestagliele»); the monthly email's «Spese in comune» section carries the same figures.

- Rebuilt the Esposizione tile of Allocazione: Titoli and Settori now weigh the notional exposure of the equity sleeves (a 2× fund counts twice its price, a 60/40 fund enters with its equity leg only), Emittenti the market value of every quoted instrument once, and a line above the list says where every euro went — «In questa vista: 120.000 € di azionario nozionale, letti al 94%: 7000 € (un ETF sintetico) non hanno una composizione pubblicata; i primi dieci titoli di ogni fondo ne nominano il 31%, il resto è «Resto letto». Fuori da questa vista: 40.000 € di obbligazionario; 8000 € di materie prime, senza titoli per natura». The percentages are shares of the base named beside the column, the list closes on «Resto letto» and «Non letto» and always adds up to 100, and «Aggiorna» asks Yahoo again while the footer dates the oldest answer used. (Proposed by Ciocc128 in #402, implemented with changes.)

## 🐛 Bug Fixes

- Fixed a category edited in Impostazioni › Spese (name, type or role) keeping its old values in Analisi for up to five minutes: the change now arrives at once.

- Fixed the smallest categories of the Analisi › Flusso chart being painted black — invisible on a dark theme — when a branch held more than seven categories: a shade now never goes darker than 55% of its colour.

- Fixed the Esposizione asking Yahoo Finance for every fund and stock on every opening of Allocazione, because its cache never matched its own key: Yahoo's answers now live in one cache shared by every account, per instrument (30 days for a useful answer, 24 hours for an empty one), so a second opening costs no call and a new instrument costs one, for everyone.

- Fixed a member of a shared account seeing their OWN exposure on the owner's Allocazione page: the Esposizione now reads the owner's instruments, like every other tile.

## 🔧 Improvements

- Added, for development, a repeatable measure of the app's speed and a size budget per page: `npm run perf:bench` opens every page of a production build against the local emulators, cold and by navigation, and reports how long each takes to show its first figure; `npm run perf:budget` reads the build and fails when a page ships more JavaScript than its ceiling allows. A ceiling only goes down with a measure, and a change that makes a page grow must raise that page's ceiling in the same commit and say why.

- Improved Analisi › Flusso on a phone: it is now a bar of the period's spending split by type, each type's categories as rows (a row opens its Scheda) and what was left over as a closing line, instead of a Sankey too narrow to read; the printed shares always add up to 100, a type that rounds to zero reads «<1%», and when the period holds amounts that are only scheduled the closing line says so. From 640px up the Sankey is unchanged. (Contributed by Ciocc128.)

- Improved Patrimonio › Strumenti for a composite instrument (a 60/40 fund, a balanced ETF): still one row, but its class chip now shows every class it holds — one segment per class, as wide as its share and in that class's colour, «Azioni · Obbl.» for two, «Misto» for three or more. A class under 5% gets no segment, a screen reader hears every share, and the group headers and the sort by class keep the prevailing class. (Contributed by Ciocc128.)

## 📚 Documentation

- Added the performance dossier (fourteen specifications; the first of them, the new Esposizione, was implemented and its specification then retired, every lesson moved into the Allocazione guide, the contributor's guide and the code's own comments) and amended the performance and mobile specifications to match the code after the three contributions above. The contributor's guide now says how a contribution that arrives while that work is open is reviewed and merged, the Allocazione guide carries the Esposizione's rules (the two measures, the four destinies, the shared cache, the words of the coverage line, what it does not do by decision), and the setup guide gained the row for the seed that keeps the Allocazione browser tests off the network.

- Added the mobile composition dossier (no code touched): the current small-screen layout measured on 19 surfaces at 390, 768 and 1024px, three directions drawn and tested, the «first screen» one chosen (a short verdict, a strip of at most four figures, one open tile, the rest as closed rows), and nine specifications to implement after the performance ones.
