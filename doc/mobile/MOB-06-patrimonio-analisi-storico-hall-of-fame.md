# MOB-06 — Patrimonio · Analisi · Storico · Hall of Fame

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 35 rilievi, 8 decisioni · Priorità: 3 (quattro pagine su un contratto già scritto) · Sforzo: L · Dipende da: MOB-01 (ritirata il 2026-10-10, in develop dal 2026-10-10, PR #448), MOB-02, MOB-03
> (`PatrimonioTile`, `ComposizioneTile`, `describeSales`), MOB-04 (`describeTrackingScope`, `CashflowKpiTrio`) — sequenza, README § 9, 9; PERF-11 ritirata, in develop · Sblocca: MOB-07, MOB-08, MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 (`doc/mobile/README.md` § 3), 390 × 844:

| Superficie | schermate | tessere (sopra / intere) | cifre / sopra | controlli / sopra | grafici | 768 · 1024 |
|---|---|---|---|---|---|---|
| Patrimonio | 5,52 | 7 (1 / 0) | 221 / 17 | 124 / 8 | 13 | 3,46 · 4,60 |
| Analisi | 4,23 | 6 (1 / 0) | 56 / 12 | 32 / 6 | 2 | 2,89 · 3,87 |
| Storico | 5,05 | 5 (1 / 0) | 103 / 15 | 27 / 1 | 3 | 3,20 · 4,20 |
| Hall of Fame | 3,43 | 5 (1 / 0) | 49 / 17 | 11 / 2 | 1 | 2,17 · 2,85 |

Righe del 2026-09-26 (chi implementa le riverifica):

- **Patrimonio** `app/dashboard/assets/page.tsx:410-525`: sette celle aperte; `:168` legge il registro senza `isError`
  (fallita = «nessuna operazione»); `StrumentiTile.tsx` rende la lista O la tabella dal 2026-10-07 (`useMediaQuery`, `:259`)
  e ha `id="strumenti"` (`:591`, usato da `e2e/assets.rows{,.mobile}.spec.ts` e `assets.composite-chip.spec.ts`). Verdetto
  `patrimonioNarrative.ts:236-282`: una frase fino a «; sul mercato…» (`:257`), poi le vendite con la ritenuta (`:277`,
  `describeSales`, `salesNarrative.ts:150`, condiviso con la Panoramica); lo zero firmato «+0 €» (`:70-77`). Il DOM è già
  nell'ordine di lettura (`desktop:col-start-*`, nessun `order-*`). Dal 2026-10-10 la tessera «Mutuo» è una per prestito
  (`summary.loanId`: per un immobile non ancora migrato è l'id dell'immobile, `:250-293`), `accounts` include i prestiti
  personali (`isLiquidityRow`, `patrimonioSummary.ts:62-64`) e l'hero conta con `formatHoldingCounts(held, accounts, loans)`.
- **Analisi** `components/cashflow/AnalisiTab.tsx:708-799`: il DOM è Periodo, Fuori scala, Spese maggiori, Spese,
  Entrate, Scheda, Flusso (`:727-814`), riordinato sul telefono con `order-1…7` (che README § 9, 1 vieta); la Scheda
  esiste solo con un focus (`:775`); si atterra da `handleEntitySelect` (`:525-542`, che scrive `focusTriggerRef`) o dal
  restauro dell'URL, che è un EFFETTO (`:323-343`) e non scrive l'opener, via `scrollToScheda` (un `setTimeout`,
  `useCallback(…, [])`, `:288-296`); il calendario chiude il verdetto (`analisiNarrative.ts:298`, `:302`, `:334`,
  `scheduledSentence`; `:623` è la lettura di una tessera). La vista del Flusso è stato interno di `FlussoTile`
  (`useState<FlowMode>('roles')`, `:117`).
- **Storico** `app/dashboard/history/page.tsx`: sei letture composte da `composeReadState` (`:136-149`, dal 2026-09-29),
  una sola `ErrorNotice` di pagina se una fallisce; il DOM è Evoluzione, Composizione, Raddoppi, Driver, Valore
  (`:436-479`) con `order-1/3/2/4/5` e i wrapper `contents` delle due colonne desktop; due chip di `EvoluzioneTile.tsx:151-170`
  ripetono la prima frase; il Driver è un ledger che torna all'euro (`storicoNarrative.ts:461`); `storicoNarrative.ts:26`
  importa già a runtime da `storicoSummary.ts`.
- **Hall of Fame**: composta da MOB-02 § 4.7, azioni in fondo comprese (README § 9, 25).

## 2. Obiettivo misurabile

`npm run mobile:budget` sul fixture `census@example.com` (README § 9, 10) a 390, `doc/mobile/budget.json` stretto con `--tighten`:

- Patrimonio, Analisi, Storico: schermate **≤ 2,5**; una tessera aperta; **≤ 5 cifre fuori dal verdetto** sopra la
  pill (`figuresOutsideVerdict`: il nodo finisce sopra il bordo alto della pill, non la piega; LA tessera compresa, 16); la prima riga chiusa sopra la pill. L'ordine dei tagli è fisso: sotto `desktop:` il
  grafico di LA tessera è alto 120 px (README § 9, 4: Patrimonio `max-desktop:min-h-[120px]` di MOB-03 § 4.3; Evoluzione
  `max-desktop:min-h-[120px] desktop:min-h-[220px]` su `EvoluzioneTile.tsx:187`; le barre di Periodo, `SpendingBarsChart`
  in `PeriodoTile`, a 120 px), sempre; poi, su Patrimonio, la striscia perde la cella Liquidità (README § 9, 40); mai la
  lettura né il valore.
- Hall of Fame: il ≤ 2,0 di MOB-02. Patrimonio al mount a 390: 0 `AssetRow`, 0 `svg.recharts-surface` in `main`.
- A 1440 le pagine di oggi, salvo: la frase del mercato di Patrimonio (README § 9, 5), lo zero senza segno (20),
  Movimenti in lettura fallita come `ErrorNotice` (41), lo `scope` del calendario di Analisi sotto il paragrafo (14), e
  le `order-*` tolte da Analisi e Storico (già `desktop:order-none`). In Playwright: ordine del DOM, pannelli chiusi vuoti, memoria.

## 3. Non-obiettivi

B e C; le primitive (un campo nuovo solo additivo); il tablet (MOB-08); DESIGN.md (MOB-09); la Panoramica (MOB-03);
Plusvalenze (MOB-05); le sparkline e i dialog (in develop dal 2026-10-07, doc/guide/patrimonio.md); la matematica; le azioni della navbar; le azioni
di Hall of Fame (già in fondo da MOB-02). Sono di altre spec, chiuse prima (README § 9, 9), e qui si usano con i loro
nomi: `PatrimonioTile.liftedFigures`, `id`, `isPatrimonioLiftedBlock` e la curva a 120 px, `ComposizioneTile` con
`collapse`/`asideWhenClosed`, i `binding` di `describeSales` (MOB-03 § 4.3-4.4); `describeTrackingScope` e il blocco
`'trio'` di `CashflowKpiTrio` (MOB-04 § 4.2).

## 4. Design

**Comune.** `useMobileSections({ route, sections })` (`route` = `assets`, `analisi`, `history`, `hall-of-fame`); ogni
riga `Tile` + `collapse` + `asideWhenClosed` (parole, mai un importo: The Closed-Row Rule; questa, Binding-Clause e
Lifted-Figure sono PROPOSTE, MOB-09); `PageRest` subito dopo la cella di LA tessera (con l'overview non letta, su
Patrimonio, è il primo figlio della griglia); LA tessera fuori dal controller (21); **una sequenza sola, il DOM di oggi**
(README § 9, 1 e 11: nessun `order-*`, le righe seguono il DOM desktop, il desktop non cambia); `PageVerdict` +
`strip` (`VerdictStrip`, `onOpen`: `perche` → `restCollapse.onOpenChange(true)`, il resto → `sections.reveal`, come
MOB-03 § 4.2) + `restCollapse`; `LIFTED_FIGURE_CLASS` via `liftedBlocks` (si nasconde solo la cifra ripetuta; letture,
classifiche e ledger restano interi: 15, 17); `validateStrip` in un test per pagina; `ErrorNotice` di riga con
`live={!sections.compact}`. La chiave `mobile-sections:<route>` non porta l'`ownerId`: la memoria è per dispositivo
(README § 9), e gli id di un altro account cadono da `known`.

### 4.1 Patrimonio

- **LA tessera** = Patrimonio totale lordo (valore e curva); l'eroe è esente dalla regola «non ripete» anche se il `lead`
  lo nomina (README § 9, 24).
- **Verdetto**: «Sul mercato ha spinto soprattutto un ETF (+900 €).» diventa una frase sua anche a 1440 (README § 9, 5);
  `lead` = «Il portafoglio vale 120.000 €: +1500 € (+1,27%) su agosto, 12 strumenti e 3 conti.»; `restLabel` dal
  contenuto del seguito: «il mercato del mese» (solo mercato), «la vendita del mese» (solo vendita), «mercato e vendita
  del mese» (entrambi), come `overviewRestLabel` di MOB-03 § 4.4. **Vincolante**: la ritenuta e il controfattuale di
  `describeSales` sono `binding` ogni volta che sono stampati (li marca MOB-03 § 4.4, modulo condiviso: Patrimonio li
  eredita): quel mese il verdetto resta intero. Lo zero firmato senza segno (`:70-77`, README § 9, 20).
- **Striscia** `selectPatrimonioStrip({ gains, cash })` (`patrimonioSummary.ts`): «G/P non realizzato» (l'etichetta di
  `RendimentoTile.tsx:68`; `gains.gainLoss`, `signed-currency`, `decimals: 2` perché la tessera stampa i centesimi,
  `:75-76`; apre `patrimonio-rendimento`; `lifts: { section: 'patrimonio-rendimento', block: 'gain' }`, e `RendimentoTile`
  di Patrimonio prende `liftedFigures?: readonly 'gain'[]` che nasconde il KPI da 22 px; `null` con `gains.count === 0`,
  `reason` «nessuna posizione con un prezzo di carico», le parole di `RendimentoTile.tsx:63`); «Liquidità»
  (`cash.shareOfTotal`, `percent`, `decimals: 1`, apre `patrimonio-liquidita`; ripete la lettura di `LiquiditaTile`, che
  resta intera, 15; `null` con `reason` «nessun totale su cui misurarla» senza totale, «i debiti superano i conti» con
  `shareOfTotal ≤ 0`). Se il census conta più di 5 cifre fuori dal verdetto, la striscia perde Liquidità (README § 9, 40).
  Overview non letta: niente `PageVerdict`, niente striscia.
- **Non si ripete**: `liftedFigures={[...liftedBlocks(strip, 'patrimonio-patrimonio').filter(isPatrimonioLiftedBlock),
  'monthly', 'yearly', 'curve-end']}` (il chip del mese è nel `lead`; il chip dell'anno si nasconde intero e il suo euro
  entra nella frase fra parentesi dopo la percentuale dell'anno, come MOB-03 § 4.3, README § 9, 17 e 40; la fine curva
  è l'eroe); il digest «Mercato» resta (il seguito lo nomina solo con `topMover && marketEffect !== null`,
  `patrimonioNarrative.ts:262-292`: una `verdictNamesMarket` come MOB-03 § 4.3 decide `'movers'`). `PatrimonioTile`
  condivisa: le prop sono di MOB-03 § 4.3, con questi nomi.
- **Il conteggio dell'hero** sotto `desktop:` è un bottone che chiama `sections.reveal('patrimonio-strumenti')`; a 1440
  resta il link a `#strumenti` (`page.tsx:430`, `StrumentiTile.tsx:571`): sotto `desktop:` la `section` di Strumenti ha
  l'id della riga, `patrimonio-strumenti`; a 1440 resta `#strumenti`. I selettori `section#strumenti` di
  `assets.rows.mobile.spec.ts` e della prova a 390 di `assets.composite-chip.spec.ts` diventano `#patrimonio-strumenti`;
  quelli a 1440 restano.
- **Righe**, nell'ordine del DOM di oggi: `patrimonio-movimenti` (il mese) · `-liquidita` (`asideWhenClosed` =
  `formatHoldingCounts(0, cashAccounts.length, prestiti personali tenuti)`: «3 conti e 1 prestito»; dal 2026-10-10 un
  prestito personale, letto «debito», apre il form asset e non il dettaglio conto) · `-classi` («per asset class») ·
  `-rendimento` («vs PMC») · `-mutuo-<loanId>` (dal 2026-10-10 una tessera per PRESTITO, eyebrow «Mutuo» o «Prestito»: il
  nome dell'immobile o del prestito se più d'uno, se no «interessi e capitale»; una riga aperta prima della migrazione
  del primo accesso si chiude dopo, perché l'id nuovo non è in memoria e `known` scarta il vecchio) · `-strumenti`
  (`formatHoldingCounts(heldInstruments.length, 0, heldLoans.length)`: «12 strumenti e 1 prestito», le stesse cifre
  dell'hero; la tabella di gestione, chiusa non monta nulla ma `StrumentiTile` resta montata, quindi `usePreloadWhenIdle`
  scarica il chunk della sparkline anche a riga chiusa; il chip di classe composito di #403 vive dentro le sue righe,
  con le quote `sr-only`: non tocca striscia né budget).
- **Stati**: `isError` del registro o della sua meta (`useAssetLedgerMeta`) → Movimenti `failed` con `ErrorNotice
  collapse`, anche a 1440 un `ErrorNotice` al posto di «nessuna operazione» (README § 9, 41); `mortgageError` → una riga
  `patrimonio-mutuo` `failed` con eyebrow «Mutuo» se almeno un prestito finanzia un immobile, se no «Prestito»; overview
  non letta (`:380`): l'ErrorNotice di oggi, `defaultOpen: ['patrimonio-movimenti']`.

### 4.2 Analisi

- **LA tessera** = Periodo (`analisi-periodo`). L'asse (`AnalisiPeriodControls`) sotto `desktop:` va nello slot `axis` di
  `PageVerdict` (README § 9, 2 e 12), subito sotto il titolo; a 1440 resta accanto al verdetto com'è (seconda istanza,
  `hidden desktop:flex`); il `lead` nomina comunque il periodo («Nel 2026…»).
- **Verdetto**: **`scheduledSentence` esce dalla `sentence` e diventa lo `scope`** (README § 9, 14): `describeAnalisiScope(input):
  Narrative | null` (nuova, `analisiNarrative.ts`) = `scheduledSentence(input.scheduled,
  describeAnalisiScheduledHorizon(input.period, input.today))` senza lo spazio iniziale, la stessa forma di
  `describeTrackingScope` (MOB-04 § 4.2); la pagina la passa come `scope` a ogni larghezza (a 1440 sotto il paragrafo);
  le chiamate di `:298`, `:302`, `:334` non la mettono più in coda; `:623` (lettura di tessera) resta. `lead` = la prima
  frase («Nel 2026 hai speso 30.000 €, −4,2% su gen–ago 2025.»), poi «Casa pesa…» si spezza a «; <categoria> pesa» →
  «. Casa pesa» anche a 1440 (5); `restLabel` «le categorie» senza anomalie, «categorie e fuori scala» con.
- **Striscia** `selectAnalisiStrip(totals)` (`analisiSummary.ts`; `PeriodCashflowTotals`, `tracciamentoSummary.ts:25`):
  «Entrate» (`currency`, apre `analisi-entrate`), «Risparmio» (`totals.net`, `currency`: il `−` U+2212 solo se negativo,
  come il trio; apre `analisi-flusso`, con il `lifts` sul blocco «Risparmio» del Flusso: sotto); solo «Entrate» porta
  `lifts: { section: 'analisi-periodo', block: 'trio' }`, che nasconde nel trio le sole cifre ripetute (Entrate; la quota
  di risparmio e la copertura restano, 17); «Spese» è nel `lead`. `PeriodoTile` + `liftedFigures?: readonly 'trio'[]`
  nasconde anche la didascalia del confronto (`PeriodoTile.tsx:55-59`), che resterebbe orfana. `[]` quando entrate e
  spese del periodo sono entrambe zero (un periodo di soli trasferimenti: il Flusso non è reso, `AnalisiTab.tsx:813`) e
  quando il periodo non è ancora iniziato (The Absence-Has-Three-Names Rule).
- **Righe**, nell'ordine del DOM di oggi (README § 9, 11; gli `order-*` si tolgono): `analisi-fuori-scala` (il mese) ·
  `analisi-maggiori` («per importo») · `analisi-spese`, `analisi-entrate` («per categoria», non l'importo) ·
  `analisi-scheda` (il nome dell'entità) · `analisi-flusso` («per tipo» / «per ruolo»: l'`asideWhenClosed` lo calcola
  `FlussoTile` dal suo `mode` e lo inoltra con `collapse`; prima della prima apertura vale «per ruolo» con
  `spendingRolesEnabled` acceso, «per tipo» spento).
- **Il Flusso sotto i 640 px** (dal 2026-09-27, #400 e #401) non è un Sankey: è una barra di quote (le spese per tipo, o i
  ruoli 50/30/20), le categorie come `RankedRows` e un blocco di chiusura «Risparmio». La soglia è del GRAFICO
  (`useMediaQuery('(max-width: 639px)')` in `AnalisiTab`, doc/mobile/README.md § 9): da 640 a 1439 la riga aperta disegna
  il Sankey, che stampa l'avanzo sul nodo Risparmio accanto alla striscia: accettato e dichiarato (è il disegno del
  tablet). Tre conseguenze per questa spec:
  - **La cifra sollevata non si ristampa.** Il blocco «Risparmio» stampa l'avanzo, che è `totals.net` quando è positivo:
    la cella «Risparmio» della striscia porta `lifts: { section: 'analisi-flusso', block: 'risparmio' }` e `FlussoTile`
    prende `liftedFigures?: readonly 'risparmio'[]`, che nasconde il blocco «Risparmio» della vista per tipo
    (intestazione e nota stampano entrambe l'avanzo) e, nella vista per ruolo, la nota di «Risparmi» (`describeFlowSurplus`
    stampa l'avanzo sempre, «Più …» dopo le righe di risparmio) e, quando nessuna riga è classificata come risparmio,
    l'intero gruppo «Risparmi»: la sua intestazione vale allora `saved + surplus` = l'avanzo, la cifra sollevata. La barra
    resta intera: la legenda stampa quote, non euro. **Le didascalie della barra** («Quote delle spese (X €)», «Quote di
    quanto è uscito (X €)», e la coda del disavanzo «X € dal patrimonio») perdono l'importo sotto `desktop:` quando
    ristampa una cifra del verdetto o della striscia; lo tengono con un disavanzo, dove la base è diversa dalle entrate
    (README § 9, 42).
  - **L'aside con controlli** sta fuori dal bottone, solo da aperta (MOB-02 § 4.2): sotto i 640 px è il solo «Per ruolo ·
    Per tipo», e solo con l'interruttore acceso; «Sottocategorie» e il conteggio dei nodi esistono da 640 in su. La vista
    scelta è stato della tessera: non entra in `mobile-sections:analisi` e riparte da «Per ruolo» a ogni montaggio.
  - **«Mostra tutte»** è una disclosure con `aria-expanded` e `aria-controls`: non è una riga chiusa (`isClosedRow` in `scripts/mobileCensus.mjs` vuole `aria-controls` = `<id>-panel` di una `section.rounded-2xl[id]`).
- **La Scheda** è in `sections` solo con un focus. Sotto `desktop:` l'atterraggio (`handleEntitySelect`, restauro
  dall'URL) chiama `sections.reveal('analisi-scheda')` al posto di `scrollToScheda`, DENTRO lo stesso `setTimeout`, ma
  attraverso un ref aggiornato a ogni commit (`revealRef.current = sections.reveal`, scritto in un effetto di layout senza
  `setState`): quando il timer scatta `analisi-scheda` è già in `sections`, mentre un `reveal` catturato dalla chiusura
  di `scrollToScheda` (stabile, dipendenze vuote, per il React Compiler) vedrebbe l'insieme senza la Scheda. Nel restauro
  è il callback asincrono dell'effetto che esiste già, mai un `setState` nel suo corpo (`react-hooks/set-state-in-effect`,
  AGENTS.md § Motion; lo schema «differito perché il corpo dell'effetto non scriva stato» è in
  `components/DeleteDummyDataDialog.tsx:66`). Il chevron chiude la riga, non il focus (l'URL lo tiene: un reload la
  riapre); Escape chiude la Scheda solo dentro il pannello aperto (`#analisi-scheda-panel`), sul trigger non fa nulla;
  «Chiudi» riporta il focus all'opener quando c'è (`focusTriggerRef`), e senza opener (deep link) al trigger della riga
  successiva nel DOM (`analisi-flusso` se c'è, se no «Il resto della pagina»). Nessuna riga `failed`.

### 4.3 Storico

- **LA tessera** = Evoluzione (`storico-evoluzione`), curva a 120 px sotto `desktop:` (§ 2).
- **Verdetto**: `lead` = la prima frase, `restLabel` «l'ultimo anno»; «versamenti inclusi» (`storicoNarrative.ts:157`) è
  `binding` (è già nel `lead`: il flag ce lo tiene). Con `growth.snapshotCount < 2` nessuna striscia.
- **Striscia** `selectStoricoStrip({ pace, featured, ledger, window })` (`storicoSummary.ts`, con import di soli tipi:
  la pagina passa `ledger = buildDriverLedger(featured.row)` e `window = featured.isRunning ?
  describeRunningWindowShort(featured.row) : null`, le stesse che `DriverTile` stampa, perché `storicoNarrative.ts:26`
  importa già a runtime da `storicoSummary.ts`): «Ultimi 12 mesi» (`pace.trailingDelta`, `signed-currency`, `lifts: {
  section: 'storico-evoluzione', block: 'trailing' }`: si nasconde solo l'euro, il `trailingPct` del chip resta, 17; apre
  `perche`; `null` con `reason` «meno di un anno di storico»); **una sola cella del Driver**, «Risparmio {anno}»
  (README § 9, 39), dalla riga del ledger (`signed-currency`, lo zero senza segno come il ledger, 20), apre
  `storico-driver`; con `isRunning` l'etichetta porta la finestra della riga del Driver (`describeRunningWindowShort`,
  `lib/utils/storicoNarrative.ts:491`: «Risparmio 2026 · gen–set»), mai un anno intero che non c'è; `featured === null`
  → niente cella.
- **Il ledger non si solleva mai**: torna all'euro sotto gli occhi (DESIGN → Ranked Rows with Residual; README § 9, 15);
  una cella lo APRE. Un test vieta `lifts` su `storico-driver`.
- **Non si ripete**: `EvoluzioneTile` + `liftedFigures?: readonly ('growth' | 'cagr' | 'trailing')[]`; la pagina passa
  `[...liftedBlocks(strip, 'storico-evoluzione'), 'growth', 'cagr']` (i due chip ristampano la prima frase del `lead`:
  crescita, percentuale e CAGR, `storicoNarrative.ts:212-216`).
- **Righe**, nell'ordine del DOM di oggi (README § 9, 11; `order-*` tolte, i wrapper `contents` restano):
  `storico-composizione` («per classe») · `storico-raddoppi` · `storico-driver` · `storico-valore` («per strumento»).
  Nessuna riga `failed` (la pagina compone gli `isError` delle sue sei chiavi con `composeReadState`).

### 4.4 Hall of Fame

Nessun asse (The Ranking-Is-Not-An-Axis Rule). Composta da MOB-02 (§ 4.7), azioni in fondo comprese (README § 9, 25):
qui censimento, `budget.json` e guida.

### 4.5 Conflitti con PERF

- **Le righe leggere di Strumenti (PERF-11, in develop dal 2026-10-07), nessun conflitto**: la riga monta Strumenti
  all'apertura, poi UN elenco — `components/assets/StrumentiTile.tsx` rende la tabella O le `AssetRow` — e ogni
  `AssetRow` disegna la sua sparkline dalla prima apertura. Ritocco: quel `useMediaQuery('(min-width: 1440px)')` diventa
  `!useCompactLayout()` (una sorgente), e il primo frame server passa dalla lista alla TABELLA: il commento sopra
  `isDesktop` in `StrumentiTile.tsx` si aggiorna. I due dialog montati da aperti sono della pagina
  (`app/dashboard/assets/page.tsx`); `e2e/assets.rows.mobile.spec.ts` apre prima «Strumenti». Lo stesso vale per la prova
  a 390 di `e2e/assets.composite-chip.spec.ts` (#403): gira nel progetto `desktop` con `setViewportSize`, ma
  `useCompactLayout` legge la larghezza, quindi a 390 Strumenti è chiusa e le `AssetRow` non esistono — il suo
  `openPatrimonio` apre la riga `patrimonio-strumenti` prima di aspettare il nome dello strumento.
- **PERF-14** (in develop dal 2026-10-08): il `layout="position"` di `assets/page.tsx` è tolto; nessun `layout` nuovo. **PERF-04** (in develop dal
  2026-09-30) ha reso pigri i grafici delle disclosure e della Scheda di Analisi e il Sankey del Flusso, che sotto i
  640 px non si scarica (doc/guide/cashflow-analisi.md); su Storico solo il PDF è pigro: Composizione, Valore ed
  Evoluzione portano recharts nel grafo iniziale e il Dettaglio resta statico (doc/guide/storico.md) — la riga chiusa
  risparmia il mount, non il download; un grafico di riga reso pigro (`lazyComponent`) riserva l'altezza (MOB-02 § 4.8). **PERF-03** (in develop dal 2026-09-30): «Aggiornato alle…» sta nel `PageHeader`, nella riga della
  descrizione: nessuna riga in più nel budget. **PERF-05/06**: la striscia legge i riassunti come sono. **PERF-12** (in develop dal 2026-10-06, AGENTS.md § Motion): `mounted` nel gestore, `reveal` in
  un `setTimeout`, mai nel corpo di un effetto (§ 4.2).
- **`perf/budget.json`** ha i tetti di `/dashboard/assets` (699), `analisi` (648), `history` (772), `hall-of-fame` (615):
  `perf:budget` prima e dopo (§ 11).

### 4.6 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: la frase del mercato anche a 1440 (5); Analisi con lo `scope` (14); Movimenti
in errore a 1440 (41); Patrimonio (24, 40, 17); le azioni di Hall of Fame (25, in MOB-02); le didascalie del Flusso (42);
una cella del Driver (39); le celle che ripetono letture e ledger (15); l'ordine del DOM (11); la curva sotto `desktop:` (4).

## 5. File da toccare

- `app/dashboard/assets/page.tsx`, `components/assets/StrumentiTile.tsx`, `components/assets/tiles/*.tsx` (`RendimentoTile`
  con `liftedFigures`, `LiquiditaTile`, `MovimentiTile`), `lib/utils/{patrimonioSummary,patrimonioNarrative}.ts`
  (`PatrimonioTile`, `ComposizioneTile` e `salesNarrative.ts` sono di MOB-03: si usano).
- `components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/tiles/*.tsx`,
  `components/cashflow/analisi/{FlowShareMobile,SpendingTypesMobileFlow,SpendingRolesMobileFlow}.tsx` (il blocco
  sollevato e le didascalie del Flusso), `lib/utils/{analisiSummary,analisiNarrative,spendingRoles}.ts`.
- `app/dashboard/history/page.tsx`, `components/history/tiles/*.tsx`, `lib/utils/{storicoSummary,storicoNarrative}.ts`.
- `app/dashboard/hall-of-fame/page.tsx` (solo se il census chiede un ritocco); i test di § 7; le spec di § 7;
  `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA (fixture). 2. Le pure e i test, falsificati. 3. Una pagina alla volta,
con la sua spec verde prima della successiva. 4. Spec esistenti, E2E completo, census e budget, `perf:budget`, `perf:census`. 5. Giro, doc, commit.

## 7. Test e falsificazione

- `__tests__/{patrimonio,analisi,storico}Summary.test.ts`: il testo di ogni cella (`formatStripFigure`) è identico a
  quello della tessera (G/P con i centesimi, Risparmio senza «+» e con «−» U+2212 sul negativo, la finestra su un anno in
  corso, una riga del Driver a zero → «0 €»); le `null` con le loro `reason` (`gains.count === 0`, `shareOfTotal` null e
  ≤ 0, `trailingDelta` null, `featured === null`); `[]` di Analisi a entrate e spese zero e a periodo non iniziato;
  `validateStrip` vuoto; nessun `lifts` su `storico-driver`; una sola cella del Driver. Falsificare togliendo `decimals: 2`
  a G/P e mettendo `signed-currency` a Risparmio: l'identità diventa rossa.
- `{patrimonio,analisi,storico}Narrative.test.ts`: dove chiude il `lead`; con ritenuta `rest = []` (falsificare togliendo
  il `binding`); i `restLabel` di Patrimonio e di Analisi; `describeAnalisiScope` non nulla con calendario, la `sentence`
  senza `scheduledSentence` (falsificare lasciandola in coda); lo zero senza segno in `patrimonioNarrative` (falsificare
  con `value >= 0 ? '+'`); l'euro dell'anno fra parentesi; il mercato come frase sua.
- `e2e/mobile-composition.patrimonio.mobile.spec.ts` (`mobile`, seed base): prima schermata (eroe visibile, chip del
  mese e dell'anno nascosti, celle), `#patrimonio-strumenti-panel` `inert` e vuoto, 0 `AssetRow`; il conteggio apre
  Strumenti; memoria; l'ordine delle `y` = ordine del DOM e nessun `[class*="order-"]`; nessuno sforamento; con
  l'overview interrotta (`page.route('**/api/dashboard/overview*', r => r.abort())`, come `e2e/settings.spec.ts:143`)
  l'`ErrorNotice`, nessuna striscia, `PageRest` primo figlio, Movimenti aperta. Rossi falsificando: `collapse` tolto a
  Strumenti (N `AssetRow`), nessuna scrittura della memoria (chiusa dopo il reload), `defaultOpen` ignorato,
  `liftedFigures` tolto (il chip del mese visibile).
- `e2e/mobile-composition.patrimonio.spec.ts` (`desktop`, 1440; `mobile` è `isMobile`): nessun `[id$="-trigger"]` nella
  griglia, striscia e «Il resto» invisibili; non «nessun `aria-expanded`», che `StrumentiTile.tsx:549` e
  `MovimentiTile.tsx:117` hanno già. Falsificare ignorando `compact`.
- `e2e/mobile-composition.analisi.mobile.spec.ts` (`analisi-mobile`): il deep link con una categoria di
  `scripts/seedAnalisiE2E.mts` apre `analisi-scheda`, focus sul trigger; chevron + reload → riaperta (falsificare
  togliendo il `reveal` dal restauro); da `analisi-spese` aperta, tocco di una categoria → Scheda aperta, «Chiudi» →
  focus sulla riga di categoria; lo `scope` del calendario visibile a 390 (e in `analisi.spec.ts` a 1440).
- `e2e/mobile-composition.history.mobile.spec.ts` (`mobile`): la cella `/^Risparmio \d{4}/` (l'anno scritto invecchia)
  apre il Driver; il ledger si legge dentro `#storico-driver-panel` (la riga dell'anno è il `button[aria-expanded="true"]`
  DENTRO il pannello), e ogni riga entra nella somma solo se `checkVisibility()` è vera: la somma torna al totale
  (falsificare applicando `LIFTED_FIGURE_CLASS` a una riga del ledger: la somma visibile non torna più); a 390 i chip
  «dal primo snapshot» e «versamenti inclusi» non visibili, con l'eroe come ancora positiva (falsificare togliendo
  `liftedFigures`); ordine delle `y` = DOM.
- `analisiSummary.test.ts`: il testo della cella «Risparmio» (`formatStripFigure`) è identico a quello dell'intestazione
  del blocco «Risparmio» del Flusso (`cachedFormatCurrencyEUR(breakdown.surplus, true)`; `surplus === totals.net` sul
  fixture). Falsificare stampando il blocco con i centesimi (`cachedFormatCurrencyEUR(v, false)`): l'identità diventa rossa.
- `analisi.mobile.spec.ts`, `bundle.lazy.mobile.spec.ts` (il primo test apre `analisi-flusso` prima dell'ancora «Quote
  del flusso»), `history.mobile.spec.ts` e la prova a 390 di `assets.composite-chip.spec.ts` aprono le righe prima di
  leggere; `analisi.mobile.spec.ts:49-57` asserisce il nuovo ordine (il DOM). In `analisi.mobile.spec.ts` le prove del
  Flusso di #400/#401 (la legenda «Quote del flusso», la riga che apre la Scheda, «Per tipo» nel blocco 50/30/20) aprono
  `analisi-flusso` PRIMA dell'ancora positiva: chiusa, la legenda non è nel DOM e l'assenza del grafico passerebbe a
  vuoto. Il blocco «Risparmio» (`:84`, oggi `toBeVisible`) e la nota sotto «Risparmi» (`:139`) cambiano verso: a 390 li
  nasconde il `lifts` della cella, quindi la cella «Risparmio» stampa l'avanzo e la regione «Risparmio» del Flusso non è
  visibile, con la legenda come ancora positiva (falsificare togliendo `liftedFigures` a `FlussoTile`: la regione torna
  visibile); le didascalie della barra senza importo a 390. L'eyebrow rosso di Movimenti e Mutuo resta a Vitest
  (`resolveOpenSections` con `failed`): registro e rate sono Firestore dal client (MOB-02 § 7).

## 8. Collaudo guidato

- A: le spec desktop di Patrimonio (`assets.*`, `assets.composite-chip` compresa, `cashflow.mortgage`), Analisi, Storico,
  Hall of Fame; Vitest nei due fusi.
  C: § 7. F (mirror, DevTools a 390 sul portatile): 1) Patrimonio e il conteggio che porta a Strumenti; 2) Mutuo come riga;
  3) Analisi da un link di categoria copiato dal desktop; 4) «Risparmio» apre il Driver e il ledger torna; 5) reload,
  «Riduci movimento», Movimenti in errore a 1440. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Patrimonio non entra nella prima schermata (hero ~700 px): la curva a 120 px, poi Liquidità fuori dalla striscia
  (§ 2); mai un'eccezione «misurato come baseline».
- Rollback per lettera (A Patrimonio, B Analisi, C Storico): nessun `collapse` = la pagina di oggi; lo `scope` di
  Analisi si rimette nella `sentence` per lettera.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest» e § Current Status; `doc/guide/{patrimonio,cashflow-analisi,storico,hall-of-fame}.md` § Composizione
mobile, e in `storico.md` la voce «Desktop is two COLUMNS» (`:87`: l'`order` «on a phone and a tablet» non vale più: le
quattro tessere seguono il DOM), in `patrimonio.md` la frase del mercato a 1440; `doc/guide/e2e-emulatori.md`; `Draft
Release Temp.md` (una riga per pagina, senza dati privati); `doc/mobile/README.md` § 6 e § 3.1. AGENTS.md no.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-06-patrimonio-analisi-storico-hall-of-fame.md: Patrimonio,
Analisi e Storico sulle primitive di MOB-02 (LA tessera con la curva a 120 px, select<Page>Strip, i blocchi non
ripetuti — solo la cifra ripetuta, l'euro dell'anno nella frase —, le righe chiuse nell'ordine del DOM con le order-*
tolte, i binding), il calendario di Analisi come scope, la Scheda come riga che si apre da sola dall'URL, una sola
cella del Driver e il ledger mai sollevato, Strumenti chiusa sopra le sue righe leggere (un elenco per larghezza, la
sparkline all'apertura), Movimenti in errore come ErrorNotice anche a 1440. I nomi sono quelli di MOB-02 § 4.1
(axis compreso), MOB-03 § 4.3 e MOB-04 § 4.2: non rinominarli.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure — l'ordine del DOM è README § 9, 11 —, § Accessibility,
  § Performance tooling), CLAUDE.md
- Leggi doc/guide/patrimonio.md, cashflow-analisi.md, storico.md, hall-of-fame.md, stati.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md (§ 9: le decisioni 1–42), MOB-02 e questa spec per intero; DESIGN.md § 5 e § 6 (MAI
  rigenerarlo; il capitolo mobile lo scrive MOB-09, dopo); i diff di MOB-03 (PatrimonioTile, ComposizioneTile,
  describeSales) e MOB-04 (describeTrackingScope, CashflowKpiTrio), che sono chiuse
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): una scelta nuova che il codice ti impone me la chiedi con lo strumento interattivo prima di toccare i builder.
Chiusura: mobile:census e mobile:budget prima/dopo sul fixture, --tighten; tsc, lint 0, Vitest in Europe/Rome e sotto
TZ=UTC; le spec Playwright di § 7 con le falsificazioni viste rosse e l'E2E completo (tutti i progetti); npm run
perf:build e perf:budget -- --dist=.next-perf prima e dopo (le quattro route hanno un tetto; da Git Bash); npm run
perf:census -- --scenario=mount,asset --route=assets --mobile --label=prima e --label=dopo; giro guidato di 5 punti sul
mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Quattro pagine sullo stesso contratto, lavoro esteso e meccanico; i tre punti di
dominio (ritenuta, calendario, ledger) sono scritti qui e chiusi da test falsificati.
