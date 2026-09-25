---
target: FIRE › Coast FIRE (components/fire-simulations/CoastFireTab.tsx)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/fire-simulations/CoastFireTab.tsx"
target_fingerprint: "sha256:132a1f80c660e80970f29ba59d35b5ad4e0aad0672fa2a8999f8c162301b8251"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/fire-simulations/CoastFireTab.tsx
timestamp: 2026-09-23T07-29-27Z
slug: components-fire-simulations-coastfiretab-tsx
closed: true
---
# Critique — FIRE › Coast FIRE (`components/fire-simulations/CoastFireTab.tsx`)

**Method: dual-agent** (A: sub-agent design review con screenshot Playwright a 1440 e 390, chiaro e scuro · B: sub-agent detector CLI + overlay `detect.js` in pagina + misure Playwright). Estensione Chrome non connessa: tutta l'evidenza in browser è di Playwright sul dev server degli emulatori, fixture `test@example.com` (35 anni → target 60, spese 30.000 €, due pensioni statali 2052 e 2058, fondo che si sblocca nel 2048, vincolo attivo). Nessuna scrittura: form mai salvato, nessun controllo che spende. Data: 2026-09-23.

## Design Health Score

| # | Euristica | Punteggio | Problema chiave |
|---|---|---|---|
| 1 | Visibilità dello stato | 3 | Il primo frame dopo il click sul tab stampa «0 €» e «0,0% del numero Coast» con la traccia già al 40,8% (`SettledValue` conta da zero al primo mount); 4 warning Recharts «width(-1)» per caricamento |
| 2 | Corrispondenza col mondo reale | 3 | Italiano, decorrenza, tredicesima, IRPEF: giusto. Ma una didascalia impila «modello ponte», «netti reali», «scontati al 4,5% reale», «a regime» |
| 3 | Controllo e libertà | 3 | Anteprima fino a «Salva ipotesi» con «Annulla»; il cestino dell'ultimo scaglione è `disabled` senza dire perché |
| 4 | Coerenza e standard | 2 | Cinque scarti dal Calcolatore corretti il 22/09 e lasciati qui (legenda Recharts, tinte nell'`aria-label`, centesimi nel tooltip, `/70`, stato vuoto senza tessere) e il P0 sotto |
| 5 | Prevenzione degli errori | 3 | `min/max/step`, data `min=oggi`; ma un'età fuori intervallo la dice solo un toast al salvataggio, non il campo con `aria-invalid` come lo SWR del Calcolatore |
| 6 | Riconoscimento vs memoria | 3 | La riga del trigger «Ipotesi» dichiara ogni ipotesi da chiuso; ma la stessa pensione è «1093 € al mese» nel verdetto e «13.114 € netti l'anno» 100 px sotto |
| 7 | Flessibilità ed efficienza | 2 | L'unico controllo che cambia la base sta in un altro tab ed è nominato solo in prosa senza link; il grafico non è raggiungibile da tastiera né dal tocco |
| 8 | Estetica e minimalismo | 2 | Verdetto di 394 caratteri con 11 cifre mono (4 righe a 1440, 9 a 390); il vincolo dichiarato sei volte; vuoti di 251 e 127 px nelle Ipotesi |
| 9 | Recupero dagli errori | 3 | `resolveCoastIncompleteReason` nomina l'input mancante; ma il salvataggio fallito parla ancora col toast «Errore nel salvataggio delle impostazioni Coast FIRE», non con `describeWriteError` |
| 10 | Aiuto e documentazione | 3 | «Modello della pensione» e «Come leggere» sono buoni; i footer di Afflussi e Scenari tengono il metodo nella tessera invece di «Come si calcola» |
| **Totale** | | **27/40** | **Accettabile** |

## Design Specificity Verdict

**Valutazione (A, non ancorata).** La composizione è di questo prodotto: l'eroe è il *gap* (75.455 € sotto «Mancano al numero Coast FIRE · modello ponte»), non il numero Coast; la rotaia degli Afflussi è un'idea che nessun calcolatore Coast generico ha (lo sconto spiegato come tre eventi datati, tutti in euro di oggi); la linea tratteggiata fa il gradino con il fondo. Ma la *risposta* resta generica: «Non ancora: continua a versare.» è ciò che dice ogni calcolatore Coast del web. Nomina quanto manca oggi e mai *quando* il ritmo attuale ci arriva, mentre il Calcolatore accanto ha già il ritmo e l'anno. E il tab è visibilmente una generazione indietro rispetto al fratello che condivide la pagina.

**Scansione deterministica (B).** CLI `impeccable detect` sui cinque file del tab: exit 0, zero finding. Overlay in pagina: 136 finding a 1440 e 132 a 390, di cui 115 e 121 dentro il pannello Coast (gli altri sono sidebar, `PageHeader`, il `body` e le etichette dell'overlay stesso; gli altri quattro tab sono `hidden` con zero figli). Letti uno a uno, i 115 sono: 41 `low-contrast` tutti «4,4:1 text #78716c on #f8f4ee», cioè il token `--muted-foreground` su `--card` (debito trasversale in CLAUDE.md); 36 `undersized-ui-text` e 24 `tiny-text` che sono la rampa enumerata di DESIGN.md (sub-eyebrow 9, eyebrow 10, metadata 11); 11 `nested-cards` che sono le tessere stesse (falsi positivi); 1 `all-caps-body` che è il sub-eyebrow; 2 `line-length` veri («Pensione INPS: decorre 7 anni dopo il target…», ~113 caratteri per riga nella tessera Pensioni statali a 1440). L'overlay NON ha visto le tre cose che la misura canvas di B ha trovato: le didascalie `/70` a 2,60:1, la legenda Recharts a 3,11 · 3,18 · 3,77:1, i chip «Parte a 61 anni» a 3,98:1.

**Overlay visivo.** Nessun tab «[Human]»: l'estensione non è connessa. Screenshot con l'overlay disegnato presi da Playwright (scratchpad della sessione, non conservati).

## Impressione generale

Il primo sguardo a 1440 è il punto alto: un titolo netto, il gap a 54 px, la rotaia che trasforma uno sconto astratto in tre eventi datati, la griglia principale senza un pixel di vuoto (280 + 12 + 333 = 625 px del Traguardo, misurato). La valle è che il titolo è un verdetto senza strada: 394 caratteri spiegano il modello e non dicono mai «al ritmo attuale ci arrivi nel 2031, a 40 anni». Sul telefono la valle viene prima: nove righe di prosa attenuata prima di qualsiasi numero. La singola opportunità più grande è quella frase, e subito dopo portare il tab al livello del Calcolatore di ieri.

## Cosa funziona

- **Il gap come eroe, con la traccia sotto.** La tessera risponde alla domanda della pagina in denaro; il chip dà la quota, la didascalia da 11 px il dato conservativo sui soli liquidi (31,4%) e di cosa il numero è lo sconto. Nulla compete col numero.
- **Afflussi come rotaia ordinata, «in euro di oggi», con «i segmenti sono un ordine, non una scala» nel footer.** Il calo del capitale richiesto è spiegato sullo schermo invece che creduto.
- **La linea a gradino è visibilmente vera e detta a parole** («472.485 € con il fondo pensione dentro. Il gradino nel 2048 è il fondo che rientra»). Overflow orizzontale zero su `main` e dentro ogni tessera a 1440 e 390; zero errori console, zero richieste fallite; con reduced motion nessun contenuto sparisce; tutti i 23 Tab stop hanno un anello di fuoco visibile.

## Problemi prioritari

1. **[P0] Il «Salva ipotesi» di un co-owner scrive sul documento sbagliato.** `CoastFireTab.tsx:121` passa `userId: user?.uid` e l'hook salva con `setSettings(userId!, …)` (`useCoastFireSettingsDraft.ts:219`, docstring alla riga 91 che lo dichiara come contratto), poi invalida `['settings', ownerId]` e rilegge il documento dell'OWNER, intatto. Sul conto condiviso il viewer vede «salvate con successo», il form torna indietro, e il SUO documento riceve una copia delle impostazioni dell'owner. Il Calcolatore e Monte Carlo scrivono con `ownerId!` (`FireCalculatorTab.tsx:495,514,530`, `MonteCarloTab.tsx:281`); `doc/guide/fire.md` dice che i quattro tab furono corretti il 25/08, questo hook no. Verificato nel codice. **Fix**: il bersaglio della scrittura è `ownerId`; una spec sul conto condiviso che legge il documento dell'owner dopo il salvataggio. **Comando**: `/impeccable harden`.
2. **[P1] Il tab è il Calcolatore di due giorni fa.** `CoastFireProjectionChart.tsx:133` dice «Orso (rosso) … Toro (verde)» mentre la palette dipinge l'Orso VERDE (`--chart-5`) e il Toro BLU (`--chart-2`), misurato sui `<path>`; la `<Legend>` di Recharts (riga 156) colora le etichette col colore della serie: 3,11 · 3,18 · 3,77:1 a 12 px, in un ordine (target · Base · Orso · Toro) che non è né quello del disegno né quello del tooltip; il tooltip stampa i centesimi su una proiezione del 2040 («55.712,44 €»); la progressbar non ha `aria-valuetext` (`CoastTraguardoTile.tsx:71-76`); lo stato «niente registrato» butta via le tre tessere e non linka nulla (`CoastFireTab.tsx:288-297`) dove il Calcolatore dal 22/09 le tiene con l'azione; il primo frame conta da «0 €» e dipinge la palette statica di `useChartColors` prima dello swap. **Fix**: le stesse quattro modifiche di `FIREProjectionChart.tsx`/`TraguardoTile.tsx` (`SeriesLegend`, nome senza tinte, euro interi, `aria-valuetext`), `describeEmptyTiles` per il vuoto, il count-up seminato dal valore al primo mount. **Comando**: `/impeccable harden`.
3. **[P1] «Non ancora» non ha un «quando».** `buildCoastVerdict` (`coastFireView.ts:623-637`) nomina il gap di oggi e i due capitali a 60 anni, mai l'anno in cui il ritmo di risparmio attuale supera il numero Coast di quell'anno (`retirementCapitalRequired / (1+r)^(T−t)`, una curva che sale ogni anno che si aspetta). Il Calcolatore ha già il risparmio e la camminata. **Fix**: UNA clausola nel verdetto non raggiunto («al ritmo attuale lo raggiungi nel 2031, a 40 anni»), e lo stesso anno come marcatore sul grafico; la base del ritmo (il risparmio del Calcolatore) è una decisione dell'owner. **Comando**: `/impeccable clarify`.
4. **[P2] Dichiarazioni ripetute e didascalie sotto soglia.** Le didascalie `text-muted-foreground/70` misurano 2,60:1 in chiaro (17 run: `CoastScenariTile.tsx:52,57`, `CoastIpotesi.tsx:71`, la stessa cifra che il Calcolatore ha eliminato il 22/09), i chip «Parte a 61 anni» su `bg-muted` 3,98:1 (`CoastDettaglio`); la clausola sulle pensioni è mensile nel verdetto (`coastFireView.ts:549`) e annua negli Afflussi (riga 801); il vincolo del fondo è detto in sei posti (verdetto, footer Traguardo, lettura Afflussi, trigger Ipotesi, didascalia Profilo, spiegazione Dettaglio); «numero Coast FIRE» / «NUMERO COAST FIRE» / «numero Coast» convivono in una tessera; due righe da 113 caratteri nella tessera Pensioni statali. **Fix**: inchiostro muted pieno; la lista delle pensioni in UN solo posto (gli Afflussi la hanno già con gli anni) e il verdetto tiene gap, camminata e vincolo; i metodi di Afflussi e Scenari dietro «Come si calcola». **Comando**: `/impeccable distill`.
5. **[P2] Il form delle Ipotesi.** A 1440, misurato: 251 px di tessera vuota sotto i quattro paragrafi di «Modello della pensione» e 127 px in «Pensioni statali» (accoppiamenti 5|7 con altezze diverse, lo stesso difetto che ha fatto ritagliare la griglia del Calcolatore); a 390, 19 input, «Salva ipotesi» e i due «Aggiungi …» sono alti 36 px sul tocco (i sei «Rimuovi» sono 44, correttamente); l'età fuori intervallo la dice solo un toast. **Fix**: righe di tessere di pari altezza (Scaglioni 4 | Modello 8 con la spiegazione su due colonne, o Modello dentro Pensioni), l'idioma `h-11 desktop:h-9` sugli input, `aria-invalid` + `aria-describedby` sui campi età. **Comando**: `/impeccable layout`.

## Persona red flags

- **Alex (power user impaziente)**: vuole invertire il vincolo da qui e trova «lo switch è nella Base di calcolo del Calcolatore» senza link (`CoastDettaglio.tsx:219`, `CoastIpotesi.tsx:203`); il trigger «Ipotesi» sta a y=915 su una finestra da 900, quindi sotto la piega; ogni modifica ricalcola all'istante ma il verdetto di 394 caratteri si rilegge senza che nulla dica cosa è cambiato.
- **Sam (screen reader e tastiera)**: 22 Tab per arrivare a «Ipotesi», 17 dei quali sono della shell; le cinque tab della `PageTabBar` sono cinque stop (nessun roving focus); il grafico non riceve mai il fuoco e non ha una tabella (`accessibilityLayer={false}`), e il suo nome accessibile mente sulle tinte; la progressbar annuncia «100» senza `aria-valuetext`; ogni `type="date"` sono quattro stop in Chromium; lo `Switch` è 36×20 (debito trasversale). In positivo: `h2` del verdetto e `h3` delle tessere, ogni tessera una regione nominata, i problemi delle pensioni in un `role="status"`.
- **Marta (l'accumulatrice metodica, controllo mensile)**: apre il tab una volta al mese per vedere se il gap si è ridotto e non trova né un delta né un «quando»; legge «1093 € al mese» e «13.114 € netti l'anno» e si ferma a riconciliare; vede il fondo a «29.800 € al valore di oggi» sulla rotaia e «472.485 € con il fondo pensione dentro» nel footer, e la somma non torna sullo schermo (382.923 + 29.800 ≠ 472.485): solo «da lì compone» lascia intuire il perché.
- **Luca (co-owner del conto condiviso)**: il P0; «Età attuale» è un campo per conto, quindi vede i 35 anni dell'owner e le sue pensioni senza che nulla dica di chi è il piano.

## Osservazioni minori

- Fasi di copertura, passo 4: il badge «422.160 € a regime» va a capo (riga da 90 px contro 58 delle altre tre).
- La tabella «Impatto delle pensioni» ripete «Parte a 61 anni» come badge nella cella di intestazione dopo che lo stesso fatto sta nelle Fasi e nella rotaia.
- L'aside di «Scenari» è una formula («rendimento reale = crescita − inflazione») dove altrove l'aside porta uno scope; il Calcolatore dice «crescita · inflazione». Le righe Scenari dicono «reale 0,5%» senza il 4% · 3,5% da cui viene.
- Rimuovere una riga pensione è un click solo: coerente col modello anteprima-fino-a-salva con «Annulla», non un delete armato; da tenere, ma il cestino disabilitato dell'ultimo scaglione deve dire perché.
- Sul telefono la rotaia diventa una lista verticale senza segmenti, e il footer «i segmenti sono un ordine» descrive segmenti che non sono disegnati.
- Il fallback del grafico è un box fisso `h-64` dentro un contenitore al 100% (`CoastFireProjectionChart.tsx:119-124`).
- In scuro restano sotto soglia solo le 17 didascalie `/70` (3,74:1) e «Patrimonio Toro» in legenda (4,18:1).
- Non catturati: il vero `TileGridSkeleton` (query calde, durata sotto i 200 ms), gli stati vuoto e lettura fallita (giudicati dal codice, `CoastFireTab.tsx:255-297`).

## Domande da considerare

1. Se il vincolo governa TUTTA la pagina e Coast deve nominarne lo stato, perché sei volte in un tab? Può portarlo una sola dichiarazione (la riga del trigger Ipotesi) mentre il verdetto tiene solo i due capitali?
2. Il numero Coast è un bersaglio che si muove: perché la pagina lo mostra «di oggi» come soglia fissa e mai come la curva che il portafoglio deve attraversare, che è la sola linea che mostrerebbe l'anno?
3. «Età attuale» deve essere un campo di Coast, se è lo stesso `userAge` che leggono Impostazioni e la regola RITA del Calcolatore? E sul conto condiviso, di chi è?
4. Lo stato raggiunto («Sì, puoi smettere di versare.») è il picco positivo giusto per chi continuerà a versare comunque, o la rassicurazione utile è «a quale ritmo posso rallentare senza spostare il 2031»?
