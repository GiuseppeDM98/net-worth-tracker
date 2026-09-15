---
target: Analisi (app/dashboard/analisi/page.tsx)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/analisi/page.tsx"
target_fingerprint: "sha256:e5820752dc45cfde1de8c68f9276d805fa3d370be897aea75945f5b11a97e3dc"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/analisi/page.tsx
timestamp: 2026-09-14T17-48-33Z
slug: app-dashboard-analisi-page-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector/browser sub-agent). Browser: estensione Chrome non connessa; evidenza live da Playwright headless sugli emulatori con il MIRROR del conto reale (`mirror@example.com`, 14 settembre 2026: 1497 movimenti dal 2023, due stipendi, 37 categorie) a 1440 · 1024 · 390, dark e light, i quattro modi dell'asse, settembre e dicembre 2026, marzo 2025, la Scheda (Mutuo), la ricerca, Confronto e Dettaglio aperti, il Flusso con sottocategorie e in drill, zoom 200%, reduced motion, l'ordine di Tab; stato vuoto su `degraded@example.com`, base `test@example.com`, fixture `analisi@example.com`. Ogni `file:line` è stato riverificato dal parent; le tre cifre della Scheda (746 = 6710/9, 8946 = 6710/9×12, 559 = media a 12 mesi) sono state ricalcolate dal parent. Voto: A proponeva 28/40; il parent abbassa l'euristica 3 da 3 a 2 (il fuoco si perde in tre punti misurati da B) e l'8 da 3 a 2 (16 coppie di etichette del Sankey sovrapposte già nella vista compatta a 1440, misurate).

## Design Health Score — Analisi (Operate)

| # | Euristica | Voto | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 3 | Il drill per tipologia del Flusso si scopre solo dal tooltip al hover («Click per dettagli», `CashflowSankeyChart.tsx:137-141`), invisibile al tocco; a 390 la quarta opzione dell'asse è «Storic», tagliata di 5,8 px oltre il bordo di `main` senza indizio di scroll (B; `segmented-pill.tsx:101` scorre dentro la pill). |
| 2 | Corrispondenza col mondo reale | 3 | Grammatica del periodo esemplare («Nel 2026 finora», «Ad agosto», `analisiNarrative.ts:98-128`); ma «Budget» come nodo centrale del flusso e «YTD» come chip (`EntityDossier.tsx:248`) sono gergo, e la listbox della ricerca si chiama «Suggestions» (cmdk, B). |
| 3 | Controllo e libertà | 2 | Da tastiera: Enter su una riga apre la Scheda e mette il fuoco sulla cella (`AnalisiTab.tsx:276-284`), ma Escape non fa nulla, «Chiudi la scheda» lascia il fuoco su `body` e anche Escape nella ricerca torna a `body` (B, tre misure); `EntitySearch` non passa `returnFocusTo` al `ResponsiveModal` (`EntitySearch.tsx:70-77` vs `responsive-modal.tsx:111`). Nessun «stessi giorni» su un mese in corso. |
| 4 | Coerenza e standard | 2 | Centesimi nella Scheda («6709,68 €», `EntityDossier.tsx:252`, `:374`) e nel Confronto («−2805,36 €», `ConfrontoAnnualeSection.tsx:189`) contro euro interi in ogni altra tessera; l'asse è `tablist` senza tabpanel (`AnalisiPeriodControls.tsx:66`, B) mentre AGENTS.md prescrive `semantics="radio"` per un valore che tutta la pagina legge; tick Recharts «€0 €150» col simbolo davanti e «-165%» col trattino (B) contro «6710 €» e «−588 €» nel DOM. |
| 5 | Prevenzione degli errori | 2 | La Scheda divide il totale dell'ANNO INTERO per i mesi vissuti (`expenseEntityStats.ts:386-389`, `:404-405`); lo Storico conta le rate materializzate nel futuro come «19 anni» (`ConfrontoDisclosure.tsx:72-77` su `AnalisiTab.tsx:336-340`, senza tetto). |
| 6 | Riconoscimento più che ricordo | 3 | Ogni tessera nomina la propria finestra, 10 `section` su 10 nominate (B). Ma le didascalie di Spese maggiori troncano la sottocategoria a 4 colonne («Elettrod…», `ranked-rows.tsx:72-74`) e il lettore deve tenere a mente che «2026» della Periodo (12 mesi) e «2026 YTD» della Scheda (9 mesi) non sono la stessa finestra. |
| 7 | Flessibilità ed efficienza | 3 | Ricerca cmdk, deep link con tre parametri piatti, frecce sulla pill (B: ArrowRight sposta selezione e fuoco). Nessuna scorciatoia per la ricerca; «Mostra tutte (29)» e il toggle Sottocategorie sono session-only (blind spot dichiarato). |
| 8 | Estetica e minimalismo | 2 | Il Flusso in vista compatta a 1440: 40 etichette da 11 px, 16 coppie con bounding box sovrapposti (B); con sottocategorie 98 nodi in 500 px fissi (`CashflowSankeyChart.tsx:63-64`, A-mirror-1440-dark-sankey-sub.png). Fuori scala con una riga è vuota per il 70% dell'altezza. |
| 9 | Recupero dagli errori | 3 | `ErrorNotice` con conseguenza e «non toccati» (`AnalisiTab.tsx:577-584`). Ma `?year=2023` (sotto il pavimento 2025) titola «Nessun movimento nel 2023» (`analisiNarrative.ts:212`) mentre il grafico disegna le barre 2023 (`buildMonthlySpending` somma `allExpenses` non pavimentate, `analisiSummary.ts:182-189`). |
| 10 | Aiuto e documentazione | 3 | Soglie dichiarate nei piè («Sopra la media di oltre il 25% e di 50 €», `FuoriScalaTile.tsx:55`), «potrebbe essere parziale» sul Confronto (`ConfrontoAnnualeSection.tsx:386-388`). Lo stato vuoto dice «Aggiungi alcune spese» senza un'azione (`AnalisiTab.tsx:601-603`). |
| **Totale** | | **26/40** | **Accettabile** |

## Verdetto di specificità del design

**Valutazione LLM (A, non ancorata).** La parte in parole è irripetibile: il verdetto declina il periodo come soggetto grammaticale, chiude nominando cosa è solo in calendario («ancora 3806 € di spese e 2456 € di entrate già in calendario da qui a fine anno»), dice «un quarto» dove il 25% è onesto (`analisiNarrative.ts:152-159`), e Fuori scala dichiara la finestra propria («Misurato su settembre 2026, non sul periodo scelto», `FuoriScalaTile.tsx:56`). Il baseline è un numero o un vuoto, mai uno zero (`SpendingBarsChart.tsx:75-77`; «lo storico parte dal 2025: nessun 2024 da confrontare», `analisiNarrative.ts:359`). La specificità si spegne nella parte in numeri della Scheda, tre chip da expense tracker qualsiasi («Media mensile · Media ultimi 12 mesi · Proiezione») che sono esattamente dove l'onestà si rompe, e nel Flusso: un Nivo di serie con un nodo chiamato «Budget» e 21 hex Tailwind che sul conto reale è una macchia.

**Scansione deterministica (B).** `impeccable detect --json` sui 9 target (20 file, 3.760 righe): exit 0, 0 finding, identico con `--no-config` (nessuna waiver di `.impeccable/config.json` tocca questi file). Grep: 5 hex, tutti fallback `?? '#…'` dietro `useChartColors` in `AndamentoStoricoSection.tsx:114,174,237,238` e `SavingsRateTrendSection.tsx:114`; 0 `lg:`/`md:`/`dark:`, 0 `text-emerald/red/…`, 0 `toFixed`, 0 `role="listitem"` su bottone, 0 `onClick` su elementi non interattivi; 1 `setTimeout` (`scrollToScheda`, 50 ms). Overflow: `main.scrollWidth − clientWidth = 0` in tutte le 39 combinazioni e 0 figli oltre il bordo della propria tessera; l'unico sconfinamento è «Storico» della pill a 390 (+5,8 px). Console: 0 errori, 0 warning, 0 `/api/` ≥ 400 (con reduced motion: 1 warning di framer-motion). Reduced motion: 281 nodi di testo = 281. Contrasto: dark min 6,21:1, light min 4,74:1 nelle viste base; 3 fallimenti reali in entrambi i modi, le etichette «Ott Nov Dic» del grafico Spese per mese (`text-[10px] text-muted-foreground` + `opacity-60` sui mesi in calendario, `SpendingBarsChart.tsx:115`) a 3,30:1 dark e 2,30:1 light. Cifre: 50/50 mono e tabular nel corpo; i tick Recharts della Scheda e del Dettaglio no. Bersagli: a 1440 con mouse solo «Mostra tutte» 106×17 e il crumb «Spese» 40×20 sotto 24 px; a 390 le 4 opzioni della pill 32 px e «Anno di confronto» 84×32.

**Overlay (B, iniezione riuscita).** `detect.js` iniettato nella pagina Playwright (live server sulla 8400, poi fermato con `live-server stop`): «44 anti-patterns found»: 26 `undersized-ui-text` e 8 `tiny-text` (i 10/9/11 px degli occhielli, dei meta e dei piè, che sono la scala di DESIGN.md), 6 `nested-cards` (una per `section`, falso positivo: gli unici antenati con sfondo sono `main` e l'inset), 5 `layout-transition` (shell). Nessun overlay visibile in un browser dell'utente: l'estensione non è connessa.

## Impressione generale

Il primo secondo è esatto: «Nel 2026 spendi più dell'anno scorso.» col punto ambra, la causa (Salute +2441 €) e l'anomalia (Hobby +432%) in tre righe, l'uscita a un clic. Poi la pagina cambia finestra senza dirlo: la Periodo stampa in rosso «Entrate in calo del 32,3% su 2025» (12 mesi contro 12, con gli stipendi di ott–dic ancora da arrivare), la Scheda di Mutuo, un fisso da 559 €, dice «al ritmo di 746 € al mese» e proietta 8946 € su un anno il cui calendario è già completo a 6710 €, e lo Storico arriva al 2043. L'opportunità più grande è una sola: ogni figura di questa pagina deve stare nella finestra che il suo occhiello nomina. Subito dopo viene il Flusso, l'ultima tessera e il momento peggiore della pagina sul conto reale.

## Cosa funziona

- **Il baseline è un numero o un vuoto, mai uno zero.** `prevYearValue: null` è un gap nel grafico, il piè spiega perché, e senza baseline il verdetto ripiega su «Mutuo è la voce più pesante» invece di inventare un delta (`analisiNarrative.ts:222`). Verificato sulla fixture e su `test@example.com` («Casa è la voce più pesante.», nessun «vs 2025»).
- **Una sola via d'atterraggio.** Riga, anomalia, spesa maggiore, nodo del Sankey, ricerca, riga del Confronto passano tutte per `handleEntitySelect` (`AnalisiTab.tsx:469-482`); il focus vive in tre parametri piatti, sopravvive al refresh con lo scroll sulla Scheda (verificato) e la riga focalizzata resta `aria-current` e forza la lista aperta (`CategorieTile.tsx:41-42`).
- **La ricerca è nel vocabolario delle modali**: occhiello «Analisi · Ricerca», titolo, lettura che dice cosa succederà, qualificatore di tipo su ogni voce (`EntitySearch.tsx:70-77`); ogni riga è un `<button>` nominato («Mutuo, 6710 €, 17%») e i due grafici SVG di Periodo e Scheda portano l'intera serie nell'`aria-label` (`SpendingBarsChart.tsx:60-61`).

## Problemi prioritari

- **[P0] La Scheda stampa tre figure che si contraddicono sullo stesso strumento.** Su Mutuo in «Anno corrente» (A-mirror-1440-dark-scheda-mutuo.png): lettura «al ritmo di 746 € al mese», chip «Media ultimi 12 mesi 559 €», chip «Proiezione 2026 8946 € al ritmo attuale» sopra un «Totale · 2026 6709,68 €» che è già l'anno intero. Causa: `computeEntityRunRate` prende `periodTotal` sull'anno INTERO (`isInPeriod`, `expenseEntityStats.ts:374-379`) e lo divide per `elapsedMonths = now.month` (`:386-389`), poi proietta `(periodTotal / now.month) * 12` (`:404-405`); `AnalisiTab.tsx:512` passa `focusPeriod` senza `throughMonth`, quindi in «Da inizio anno» la lettura dice «Nel 2026 finora hai speso 6710 €» mentre la riga per anno dice «2026 YTD 5032,26 €». E la stessa frase mescola due finestre: totale a 12 mesi + «in linea con gli stessi mesi del 2025» dal `yearRow.isPartial` (`AnalisiTab.tsx:533-536`), il Don't finale di DESIGN.md §6.
  **Perché conta:** è la tessera su cui atterrano tutti i sei punti d'ingresso, e Principio 1 di PRODUCT.md dice che una cifra che il prodotto non può difendere non si stampa.
  **Fix:** `focusPeriod` porta `throughMonth` da `resolvePeriodThroughMonth`; la media divide il totale VISSUTO per i mesi vissuti (o il totale intero per 12) e la chip dice quale; la proiezione sparisce quando il calendario copre già l'anno (o proietta solo la parte non in calendario); nella lettura delta e totale sulla stessa base; centesimi fuori dalla Scheda.
  **Comando:** `/impeccable harden`.

- **[P1] Lo Storico non ha una fine e lo dice solo a metà.** «Dal 2025 hai speso 83.300 €» include le rate e ricorrenze materializzate 2027+; il Confronto dichiara «dal 2025 · 19 anni» e disegna l'asse fino al 2043 con 17 barre vuote, il Dettaglio idem (A-tall-1440-dark-history.png; `ConfrontoDisclosure.tsx:72-77` conta `availableDataYears`, che `AnalisiTab.tsx:336-340` prende senza tetto; `ConfrontoAnnualeSection.tsx:307-318`). La Periodo invece si ferma a oggi (`buildYearlySpending`, `analisiSummary.ts:223`): due grafici, due finestre, una pagina. La clausola «9528 € già in calendario» è senza orizzonte per costruzione (`describeAnalisiScheduledHorizon` → null, `analisiNarrative.ts:167`), e l'orizzonte è il 2043.
  **Perché conta:** The Scheduled-Is-Not-Spent Rule vale «con importo e orizzonte»; qui l'orizzonte manca proprio dove è più lungo.
  **Fix:** lo Storico chiude sull'anno corrente, calendario incluso, e lo dice nel soggetto («Dal 2025 al 2026»); `availableYears` e `multiYearData` tagliati a `today.year`; il conteggio «N anni» sugli anni vissuti.
  **Comando:** `/impeccable clarify` + `/impeccable harden`.

- **[P1] Il Flusso è illeggibile sul conto reale e muto per uno screen reader.** Vista compatta a 1440: 40 etichette, 16 coppie sovrapposte (B); con sottocategorie 98 nodi in 500 px fissi (`CashflowSankeyChart.tsx:63-64`; `FlussoTile.tsx:51` costruisce tutto); a 390 un groviglio (A-tall-390-dark-current.png). L'svg è `role="img"` senza `aria-label` (B), le etichette Nivo sono `brighter 1.5` di hex non token (rgb(255,255,19)), il drill per tipo esiste solo nel tooltip.
  **Perché conta:** è l'ultima tessera della pagina (peak-end), l'unico Sankey dell'app, e su 29 categorie non risponde a nessuna domanda che le due tessere per categoria non abbiano già chiuso.
  **Fix:** altezza in funzione dei nodi; layer sottocategorie limitato ai top-N per categoria con un nodo «altre»; `aria-label` con la lettura della tessera; l'affordance del drill nel piè in parole; le etichette a un token.
  **Comando:** `/impeccable distill` + `/impeccable harden`.

- **[P1] Il verdetto premia un mese a metà, e la Periodo colora un artefatto.** Settembre al giorno 14: «A settembre spendi meno di settembre 2025.» col punto verde, −58,2% (A-mirror-1440-dark-current-sep.png): `resolveHeadline` dà tono `positive` anche con `scope.inProgress` (`analisiNarrative.ts:215-220`, `comparisonDeltas.ts:70-76`); «(mese in corso)» è nella frase, ma la rassicurazione è falsa in partenza e Tracciamento ha già la finestra «stessi giorni» (`tracciamentoSummary.ts:204`). Nella Periodo su «Anno corrente»: «Entrate in calo del 32,3% su 2025» in rosso: è il confronto 12-su-12 scelto dal proprietario (`comparisonDeltas.ts:51-61`, non da «aggiustare»), ma la lettura non dice, lì dove stampa il rosso, che tre mesi di stipendi non sono ancora arrivati.
  **Perché conta:** il co-intestatario che apre la pagina una volta al mese legge «entrate −32%» e un verdetto verde su un mezzo mese.
  **Fix:** su un mese in corso tono neutro e «finora» (o la finestra «stessi giorni» di Tracciamento); nella lettura della Periodo su un anno in corso «(3 mesi ancora in calendario)» accanto al delta delle entrate, o niente colore di segno.
  **Comando:** `/impeccable clarify`.

- **[P2] Il fuoco si perde in tre punti, l'asse è un tablist senza pannello, e tre etichette sono sotto AA.** B: Escape sulla Scheda aperta non fa nulla; «Chiudi la scheda» → fuoco su `body`; Escape nella ricerca → `body` (nessun `returnFocusTo`, `EntitySearch.tsx:70-77`); la listbox si chiama «Suggestions»; un `role="status" aria-live="assertive"` vuoto di Recharts vive dentro `main` (tooltip di default della Scheda); l'svg di Andamento risparmio è `role="application" tabindex="0"` senza nome. L'asse è `role="tablist"` con 4 `tab` senza `tabpanel` (`AnalisiPeriodControls.tsx:66`), opzioni alte 32 px a 390 e «Storico» clippato. «Ott Nov Dic» a 3,30:1 dark / 2,30:1 light (`SpendingBarsChart.tsx:115`, `opacity-60` sopra `text-muted-foreground`). Tick «€0 €150» e «-165%» fuori dal formato della pagina (`EntityDossier.tsx:453`, `SavingsRateTrendSection.tsx:66-73`).
  **Perché conta:** WCAG 2.4.3, 1.4.3, 4.1.2; la stessa regola (`SegmentedPill radio`, `returnFocusTo`) è stata chiusa su Dividendi il 2026-09-14.
  **Fix:** `semantics="radio"` e `optionClassName` `h-11 desktop:h-8`; `returnFocusTo` sulla ricerca e sulla Scheda (il trigger della riga); Escape chiude la Scheda; i mesi in calendario senza `opacity-60` (un token, non un'opacità sopra un muted); `tick={CHART_TICK_STYLE}` + `formatCurrencyCompact` it-IT; `aria-label` sul grafico del risparmio.
  **Comando:** `/impeccable harden` + `/impeccable adapt`.

## Segnali di allarme per persona

**Alex (power user)**: nessuna scorciatoia per «Vai a categoria…»; per vedere Hobby a settembre «sugli stessi giorni» non c'è modo; il Sankey gli costa 500 px di scroll per una tessera che non legge; «Mostra tutte (29)» torna chiuso a ogni visita; il picker del mese ha 13 voci senza indicazione dei mesi vuoti.

**Sam (screen reader e tastiera)**: 14 stop di sidebar prima del contenuto e nessuno skip link (shell); il verdetto è `h2` con nome di regione e le righe sono bottoni nominati (bene); poi il Sankey è un'immagine senza nome, la Scheda si apre ma Escape non la chiude e «Chiudi» lo lascia nel vuoto, «Suggestions» in inglese, un `assertive` vuoto dentro `main`; l'asse annuncia «scheda 2 di 4» ma nessun pannello segue. Al 200% (720 px) la pagina regge (A-mirror-720-dark-zoom200.png).

**Riley (stress tester)**: refresh a Scheda aperta → ripristino e scroll corretti; dicembre 2026 → «Dicembre non è ancora iniziato. 588 € già in calendario.» (bene), ma Fuori scala resta con «Nessuna categoria oltre la sua media» su un mese vuoto (`resolveSingleMonth` restituisce il mese futuro, `analisiSummary.ts:53-58`) e Spese maggiori elenca «Mutuo 28 dic» senza chip «In calendario»; `?year=2023` → titolo «Nessun movimento nel 2023», Select dell'anno vuoto, barre 2023 disegnate lo stesso; 585 spese e «Altre 21 categorie» reggono.

**L'investitore metodico mensile e il co-intestatario (PRODUCT.md)**: apre «Anno corrente» il 14 del mese e trova «Entrate in calo del 32,3%» in rosso senza il perché lì dove è stampato; apre Mutuo, la spesa più prevedibile che ha, e trova tre ritmi diversi; apre «Storico» e scopre che dura fino al 2043. Il mese l'ha capito dal verdetto; le tessere sotto lo tradiscono.

## Osservazioni minori

- Occhiello stampato due volte quando una disclosure è aperta: «CONFRONTO ANNUALE» nel trigger e nella tessera (`ConfrontoDisclosure.tsx:86`, `ConfrontoAnnualeSection.tsx:354`); «DETTAGLIO» → «ANDAMENTO RISPARMIO».
- Placeholder «—» nella riga 2025 della Scheda (`EntityDossier.tsx:253`), nel Confronto per una categoria «Nuova» (`:190`) e sotto Risparmio con entrate a zero (`CashflowKpiTrio.tsx:81`): tre assenze con lo stesso nome.
- «0,00 € (0,0%) vs 2025 stessi mesi» nella riga per anno mentre la lettura sopra dice «in linea».
- Nel «Trend mensile · ultimi 24 mesi» della Scheda la legenda della linea tratteggiata si sovrappone alle barre più alte (A-mirror-1440-dark-scheda-mutuo.png).
- Fuori scala con una riga: 70% della tessera vuota; Spese maggiori a 390 tronca «Elettrod…», «Condomi…».
- Lo stato vuoto (`degraded`) è UNA tessera, giusto, ma senza azione: «Aggiungi alcune spese» senza un link a Tracciamento.
- 1 warning framer-motion con reduced motion attivo (shell, non Analisi).

## Domande da considerare

1. Se il proprietario ha scelto 12-su-12 per la Periodo (stessa base ai due lati), perché la Scheda dello stesso anno confronta 9-su-9 tre tessere più in basso, e la sua proiezione moltiplica per 12 un totale già a 12?
2. Il Flusso risponde a una domanda che «Spese per categoria» ed «Entrate per categoria» non hanno già chiuso, o è un grafico che ha bisogno di una pagina sua?
3. «Storico» significa «tutto ciò che ho registrato» o «tutto ciò che ho vissuto»? Oggi significa «fino al 2043».
4. Un mese al giorno 14 merita un verdetto col punto verde, o solo una lettura?
