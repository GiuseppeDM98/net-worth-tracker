---
target: Cashflow › Tracciamento (app/dashboard/cashflow/page.tsx)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/cashflow/page.tsx"
target_fingerprint: "sha256:b71a0112f0c0931d10796d1145228a3712e4495f21c25d6291eb93bd533b6714"
target_path: "/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/cashflow/page.tsx"
timestamp: 2026-09-14T06-15-58Z
slug: app-dashboard-cashflow-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Browser: estensione Chrome non connessa; evidenza live da Playwright headless sugli emulatori con il MIRROR del conto reale (`mirror@example.com`, 1496 movimenti, 14 settembre 2026) a 1440 · 1024 · 390, dark e light, cinque periodi, quattro modali e il drawer. Ogni `file:line` è stato riverificato nel sorgente dal parent; il conflitto A/B sull'overflow è stato risolto sullo screenshot (A misurava la tessera, B `main`).

## Design Health Score — Cashflow › Tracciamento (Operate)

| # | Euristica | Voto | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 2 | verdetto, «giorno 14 di 30» e letture ottimi; ma il submit a vuoto di «Nuova spesa variabile» lascia la riga di lettura sulla frase idle (misurata invariata, `handleSubmit(onSubmit)` senza `onInvalid`, `ExpenseDialog.tsx:452`), 0 campi `aria-invalid` |
| 2 | Corrispondenza col mondo reale | 2 | «34 movimenti, di cui 7 in calendario (3753 €)» somma 1297 € di spese e 2456 € di entrate in UNA cifra (`cashflowNarrative.ts:560`); «Nel 2043 hai speso senza entrate» al passato (`ongoing: period.year === today.year`, `:114`) |
| 3 | Controllo e libertà | 2 | Escape corretto ovunque, «Ripristina» non tocca il periodo, il range custom rinuncia al delta; ma nessun undo e il delete inverte il saldo del conto collegato senza dirlo (`ExpenseTrackingTab.tsx:419-427`) |
| 4 | Coerenza e standard | 2 | tre vocabolari di colore per gli stessi cinque tipi (legenda, feed, tabella) e lo stesso `--chart-2` è «Entrate» nella legenda e «Spese Fisse» nella tabella; due flussi di delete (drawer annidato / AlertDialog 18px); due modelli di paginazione nella stessa tessera |
| 5 | Prevenzione dell'errore | 3 | il tipo prima dei campi, «Salvato come negativo», righe future chippate e senza tinta di segno, `reconcileTransferDelete` su entrambe le gambe; nessuna conseguenza detta prima di eliminare |
| 6 | Riconoscere invece che ricordare | 3 | le letture fanno il lavoro; ma a 390 quattro tab sono icone da 38×32 e il popover del periodo espone 73 bottoni-giorno + 4 scorciatoie + 3 anni + 6 mesi (702×590) |
| 7 | Flessibilità ed efficienza | 2 | «Feed/Tabella» si resetta a ogni visita (`ExpenseTrackingTab.tsx:270`); nessuna scorciatoia né «salva e aggiungine un'altra»; nel picker gli anni partono da 2043; bene CSV, 5 ordinamenti, picker ripetuto nella barra mobile |
| 8 | Estetica e minimalismo | 2 | composizione calma nei due temi; ma «89% / 9% / 2%» sono dipinti FUORI dalla tessera Entrate a 1440 (misurato `ul` 273/235, visibile in dark e light) e sotto le tre righe restano ~180px di vuoto |
| 9 | Recupero dall'errore | 1 | «Invalid input» in inglese sotto Importo accanto a «Categoria è obbligatoria»; la riga di lettura non cambia; `scrollTop` 0 |
| 10 | Aiuto e documentazione | 3 | «Il tipo decide le categorie disponibili, quale conto si muove e quali budget la contano.», «Stato: In calendario — non ancora avvenuta» — tra i migliori del repo |
| **Totale** | | **22/40** | **Acceptable** (55%) |

## Design Specificity Verdict

**LLM assessment (A):** autoriale nella frase, intercambiabile nell'inventario. «Settembre sta andando bene.» + «A settembre hai messo da parte il 29% (805 €): entrate 2758 €, spese 1953 €, in calo del 59,8% su agosto. Nel totale ci sono ancora 1297 € di spese e 2456 € di entrate già in calendario da qui a fine mese.», l'occhiello «giorno 14 di 30», «per ogni euro speso ne entrano 1,41», «2 mesi in deficit: aprile e giugno»: nessun template lo produce. Sotto i primi 300px la pagina è un expense tracker qualunque — sei controlli di filtro, una tabella a 8 colonne, un dialog a 10 campi — e non collega mai il risparmio che produce al patrimonio, al rendimento o al piano: l'unico link in uscita è «Tutte le categorie in Analisi», due volte identico.

**Deterministic scan (B):** `impeccable detect --json` su 11 file → 0 findings (anche `--no-config`); la sonda di controllo prova che su `.tsx` il detector legge solo valori CSS letterali (ha colto un `cubic-bezier`, mancato `text-[9px]`, `img` senza alt, `#ff0000`, `h-6 w-6`, card annidate). Overlay `detect.js` live a 1440: 79 findings (54 in `main`) — `undersized-ui-text` ×47 (gli occhielli a 10px, scala dichiarata), `nested-cards` ×5 (la griglia), `tight-leading` ×1 (`text-sm` a 1,25), `tiny-text` ×1; `text-occlusion`, `dark-glow`, `layout-transition`, `clipped-overflow-container` misurano l'overlay stesso o la shell. A 390: 65 (54 in `main`). Nessun overlay visibile a un umano (headless).

**Dove A e B concordano:** «Tutte le categorie in Analisi» 147×17 due volte (`ExpenseTrackingTab.tsx:765`, unico target < 32px della pagina a 1440); «Invalid input» + status line invariata; 0/8 `<th scope="col">` in Tabella (`components/ui/table.tsx:68-70` non lo aggiunge); «Feed/Tabella» `role=tab` senza `aria-controls`; il picker a 702×590. **B oltre A:** contrasto 0/289 sotto AA in dark, 1/289 in light («Tabella» inattivo 4,35:1, `text-muted-foreground` su `bg-muted` — la stessa trappola che AGENTS.md documenta per `SegmentedPill`); due stringhe inglesi `sr-only` del MultiSelect («No options selected» dentro un `aria-live`); i due input data del picker senza `aria-label`; `aria-modal` assente sui dialog; il drawer filtri a 390 con `scrollHeight` 1188 su 396; il dettaglio riga un `Drawer` largo 1440. **Falsi positivi di B:** `nested-cards`, `text-occlusion`, `dark-glow`, `layout-transition`.

**Pulito, misurato in quattro viste:** overflow di `main` 0; nomi accessibili mancanti 0; `img` senza alt 0; console error/warning 0 (cold e warm); `/api/` ≥ 400 zero; ordine DOM = ordine visivo; 39/40 stop con focus visibile; 8-9 tab stop prima della griglia.

## Overall Impression

La pagina giudica meglio di qualunque concorrente e poi contraddice se stessa nei dettagli: un verdetto costruito su uno stipendio che arriva domani, un verde che significa «entrata» a sinistra e «spesa fissa» a destra, tre percentuali fuori dal bordo sulla schermata di default, un form che rifiuta in inglese. Opportunità: la stessa onestà del verdetto applicata al livello operativo e al calendario.

## What's Working

1. **L'assenza onesta.** Range custom 1–9 set: «Nel periodo le spese hanno superato le entrate di 116 €: entrate 245 €, spese 361 €.» — nessun delta, nessun «su …»; anno vuoto: «Nessun mese con entrate nella finestra.» / «Nessuna entrata registrata nel periodo.» La Absence Rule applicata fino alle parole.
2. **Il feed mobile è il modello.** Riga 49px, importo mono con tinta di segno, chip `Marcella`/`Giuseppe` solo sulle righe attribuite, «VEN 11 SET», il dettaglio con «Stato: In calendario — non ancora avvenuta» e due bottoni da 44px.
3. **La regola dello «scheduled» è visibile.** Chip «In calendario», tinta di segno tolta, i mesi non iniziati a opacità ridotta, la clausola «Nel totale … già in calendario» con l'orizzonte del periodo.

## Priority Issues

### [P1] Il verdetto prende il tono da uno stipendio non ancora accreditato, e su «Quest'anno» il calendario è asimmetrico
- **What**: `ExpenseTrackingTab.tsx:345-346, 661, 683` — `totals` copre l'intera campata e `resolveTone(totals.savingsRate, …)` (`cashflowNarrative.ts:242-245, 279`) ne prende il tono. Misurato sul mirror il 14/09: 2456 € dei 2758 € di entrate e 1297 € dei 1953 € di spese sono righe «In calendario» (Stipendio Giuseppe datato 15/09). Il mese vissuto è −354 €; la pagina stampa «Settembre sta andando bene» e «29%». Su «Quest'anno»: entrate 41.531 € IDENTICHE a «Da inizio anno», spese 39.868 € contro 37.358 € — ott–dic porta 2510 € di rate materializzate e 0 € di stipendi (`canTypeRecur` esclude `income`), il tasso crolla dal 10% al 4% e il verdetto ne prende il tono.
- **Why it matters**: la Scheduled-Is-Not-Spent Rule dichiara la PRESENZA del forecast (scelta del proprietario, `doc/guide/cashflow-tracciamento.md`), non la sua ASIMMETRIA: la clausola dice «3806 € di spese e 2456 € di entrate già in calendario» ma non che il lato entrate del calendario è vuoto per tre mesi. Il lettore metodico legge un giudizio che il giorno dopo cambia.
- **Fix**: senza toccare la regola dell'anno intero — (a) quando la parte in calendario pesa più della parte avvenuta su uno dei due lati, la clausola nomina la copertura («di cui lo stipendio di settembre, 2456 €, non ancora accreditato»; «da qui a dicembre il calendario tiene 3806 € di spese e nessuna entrata»); (b) accanto al tasso del periodo il tasso MISURATO a oggi (`splitSpendingAtDate` esiste già e alimenta la proiezione); (c) se il proprietario lo vuole, il tono dalla parte avvenuta con il calendario come seconda frase — decisione sua, da porre.
- **Suggested command**: /impeccable harden

### [P1] Lo stesso verde è «Entrate» nella legenda e «Spese Fisse» nella tabella
- **What**: `ExpenseTable.tsx:256-267` mappa `income → --chart-1`, `fixed → --chart-2`; la legenda di `CashflowPeriodoTile.tsx:82-87` disegna `Entrate → --chart-2`, `Spese → --chart-1`; `CompactExpenseRow.tsx:13-19` è un TERZO vocabolario (`income → bg-positive`, `fixed → --chart-1`). Misurato nel DOM: il badge «Spese Fisse» è `lab(66.98 −58.27 19.54)` = `--chart-2` (Jade Return), lo stesso quadratino che 400px sopra dice «Entrate». Il commento a `ExpenseTable.tsx:254` («chart-1: income (green-toned in most themes)») è falso: `--chart-1` è Indigo Signal in entrambi i modi. Nel KPI le Spese sono rosse (`CashflowKpiTrio.tsx:66`) e nel grafico blu.
- **Why it matters**: la pagina che insegna dove vanno i soldi insegna due volte, a 400px di distanza, che il verde è entrata e che il verde è spesa; qualunque lettura a colpo d'occhio della tabella è invertita.
- **Fix**: UNA mappa tipo→colore in `lib/constants/` (Rule of Three: tre file la duplicano), consumata da legenda, feed e tabella: `income` = token di segno `positive`, i quattro tipi di uscita su slot distinti e nessuno sullo slot che la legenda dà alle entrate; correggere il commento a `:254`; `ExpenseTable.tsx:542` da `text-emerald-*` a `text-positive`.
- **Suggested command**: /impeccable colorize

### [P1] «89% · 9% · 2%» sono dipinti fuori dalla tessera Entrate, a 1440, in entrambi i temi
- **What**: `components/ui/ranked-rows.tsx:22,74,77` — etichetta `w-[42%] min-w-[72px] shrink-0` + barra `min-w-[40px]` + importo `w-[64px] shrink-0` + `w-[34px] shrink-0` + 3 gap: minimo 246px. La tessera è `desktop:col-span-3` (`ExpenseTrackingTab.tsx:1036`) e misura 277px, 235 di contenuto: `ul.scrollWidth` 273/235, «89%» 37px oltre il bordo interno, e né `Tile` né `ul` hanno `overflow` (screenshot `01-1440-dark-full.png`, `04-1440-light-full.png`). La gemella Spese a `col-span-4` (373px) sta dentro.
- **Why it matters**: l'unico difetto visibile senza leggere, sulla schermata di default, nel prodotto il cui nord è «Effortless Precision»; B non lo ha visto perché misurava `main`, il che dice che nessun guardia misura le tessere.
- **Fix**: etichetta `flex-1 min-w-0 truncate` (via `shrink-0`), o sotto una soglia di larghezza cadere la colonna `%` (la barra codifica già il rango); oppure Entrate `col-span-4` e Spese `col-span-3`. Un test Playwright che misura `scrollWidth === clientWidth` su ogni `ul` di `RankedRows` a 1440/1024/390.
- **Suggested command**: /impeccable layout

### [P1] Il form della spesa rifiuta in inglese e la riga di lettura tace
- **What**: submit a vuoto di «Nuova spesa variabile»: «Invalid input» (zod default su `amount: z.number().positive(...).optional()`, `ExpenseDialog.tsx:126`, con `''` in ingresso) + «Categoria è obbligatoria»; `handleSubmit(onSubmit)` senza `onInvalid` (`:452`): la status line resta «La voce entra nelle spese del mese…» (misurata prima/dopo), 0 `aria-invalid`, `scrollTop` 0, focus su `#amount`. L'occhiello del passo 2 perde il contatore («Passo 1 di 2» → «Nuova voce · Spesa variabile»).
- **Why it matters**: lo stesso difetto chiuso su Patrimonio il 14/09 (`describeFormRefusal`, messaggi zod italiani, «Passo 2 di 2 · ETF»), sulla modale più usata dell'app; contro «Italiano per costruzione» e `doc/guide/dialog.md` («The reading IS the status line»); l'unico `aria-live` del dialog non cambia.
- **Fix**: `z.coerce.number({ message: 'Inserisci un importo' })` o `preprocess` con messaggio italiano; `onInvalid` → `describeFormRefusal` nella riga di lettura («Mancano 2 campi: Importo e Categoria.») + `scrollIntoView` + `aria-invalid`; occhiello «Passo 2 di 2 · Spesa variabile».
- **Suggested command**: /impeccable clarify

### [P2] Il mese in corso è confrontato con agosto intero, e la tessera accanto sa già la risposta giusta
- **What**: `tracciamentoSummary.ts:177-186` — `currentComparisonWindow` restituisce il periodo tale e quale per `kind === 'month'` e `previousPeriod` (`:194-199`) agosto intero: il verdetto stampa «in calo del 59,8% su agosto» e i KPI «↓ 46,8% / ↓ 59,8% vs agosto» — 14 giorni più calendario (1953 €) contro 31 giorni (4854 €). La stessa funzione rifiuta questa asimmetria per l'anno («twelve against eight is a rise by construction», `:189-193`) e il footer della stessa tessera stampa «Al ritmo attuale ~2703 € · Ad agosto 4854 €».
- **Why it matters**: il mese è il periodo di default; la regola più curata della pagina è applicata al caso raro e non a quello quotidiano, e −59,8% non significa nulla per 29 giorni su 30.
- **Fix**: estendere `currentComparisonWindow` al mese in corso (1 → oggi contro gli stessi giorni del mese precedente) e farlo nominare da `describeComparisonPhrase` («sui primi 14 giorni di agosto»); in alternativa confrontare la proiezione e dirlo. Decisione del proprietario tra le due.
- **Suggested command**: /impeccable harden

## Persona Red Flags

**Alex**: «Feed/Tabella» torna a Feed a ogni visita; 22 tab stop fino al picker del periodo; nessuna scorciatoia, selezione multipla o «salva e aggiungine un'altra» su un form da 10 campi; il picker offre gli anni da 2043 in giù (piani rateali lunghi) e il 2026 non è visibile senza scorrere; CSV esporta i filtri ma non l'ordinamento.

**Sam**: 0/8 `<th scope="col">`; nessun `aria-sort`; un `role=tablist` senza `aria-controls`; il fallimento del submit non è annunciato; «No options selected» in inglese dentro un `aria-live`; due input data senza `aria-label`; solo due heading su tutta la pagina (h1 14px, h2 30px) e nessun `h3` per le sei tessere; il dettaglio riga è un `Drawer` grezzo con la conferma in un secondo drawer. Ok: 0 controlli senza nome, Escape disarma e non chiude il dettaglio, 39/40 focus visibili, 0/289 sotto AA in dark.

**Casey**: la tessera Movimenti comincia a y 1782 su 3650; 13 target sotto 44px a 390 (quattro tab icona-muta 38×32, tre controlli della barra a 36px — blind spot dichiarato); il trigger del periodo nella barra tronca a «Settembre 20…»; il drawer filtri ha 3× il suo contenuto sotto scroll.

**Il risparmiatore metodico**: apre il 14 e legge «sta andando bene · 29%» costruito su uno stipendio di domani; apre «Quest'anno» e legge 4% perché il calendario tiene tre mesi di rate e zero stipendi; vede −59,8% contro un mese intero; e la pagina che produce il suo risparmio non lo collega mai a Patrimonio, Rendimenti o FIRE.

## Minor Observations

- Vista Tabella (`ExpenseTable.tsx`): 44 celle con cifre in Geist Sans (Mono Mandate), `text-emerald-*` a `:542`, AlertDialog del delete a 18px senza ombra che dice «Sei sicuro di voler eliminare questa voce?» senza voce né importo mentre riporta indietro un saldo — è una delle otto superfici fuori vocabolario dei Known Issues; 44 target < 44px nella tabella.
- «34 movimenti, di cui 7 in calendario (3753 €)» somma spese ed entrate (`cashflowNarrative.ts:560`) mentre il verdetto le tiene separate.
- «Nel 2043 hai speso» / «sul 2042»: `ongoing` dovrebbe essere `>=` (`cashflowNarrative.ts:114`).
- Su «Quest'anno» il verdetto dice «in aumento del 34,4%» e la tessera «Entrate in calo del 4,1%» sulla stessa base: due percentuali opposte a 60px, distinte solo dal soggetto.
- Passo 1: la quinta scheda «Trasferimento» (670×73) orfana su tutta la larghezza in griglia a 2 colonne.
- «Tutte le categorie in Analisi →» 147×17 due volte (`ExpenseTrackingTab.tsx:765`): non usa `TILE_FOOTER_ACTION_CLASS`, che `tile.tsx` esporta per questo.
- Il popover del periodo (702×590) mette due calendari sopra le quattro scorciatoie che coprono la maggior parte degli usi.
- Due modelli di paginazione nella stessa tessera: «Carica altri 14 · 20 di 34» nel feed, «Righe per pagina · 1-20 di 34» in Tabella.
- `text-sm text-muted-foreground` a line-height 1,25 (`tight-leading`), «Tabella» inattivo 4,35:1 in light.
- `aria-modal` assente sui dialog; il dettaglio riga a 1440 è un drawer largo 1440.

## Questions to Consider

1. Se la pagina sa calcolare «Al ritmo attuale ~2703 €» e sa che 2456 dei 2758 € non sono arrivati, perché l'unica frase che giudica prende il tono dalla cifra che non è ancora un fatto?
2. Il prodotto ha un solo token di segno e otto slot con un significato ciascuno: come fa `--chart-2` a essere «Entrate» in una legenda e «Spese Fisse» in una tabella a 400px, e chi se ne accorgerebbe senza misurarlo?
3. Questa è la pagina che produce il numero che tutte le altre spendono: cosa cambierebbe se la tessera Risparmio, oltre a «805 € · 29,2% · 1,41×», dicesse quanti mesi di spesa quel risparmio compra o di quanto avvicina il FIRE?
