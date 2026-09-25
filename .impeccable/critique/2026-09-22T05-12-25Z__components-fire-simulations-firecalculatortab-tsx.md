---
target: critique FIRE › Calcolatore
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/fire-simulations/FireCalculatorTab.tsx"
target_fingerprint: "sha256:c92c1126537da8d536aeb9f26840dfa362fb469ca6b6016a5da48a97ea9a52a0"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/components/fire-simulations/FireCalculatorTab.tsx
timestamp: 2026-09-22T05-12-25Z
slug: components-fire-simulations-firecalculatortab-tsx
closed: true
---
Method: dual-agent (A: design review sub-agent · B: detector + Playwright evidence sub-agent), 2026-09-22. Chrome extension not connected: browser evidence is Playwright's on the emulator dev server (`test@example.com`, which sits in the «Sei già FIRE» state and on a warm named theme — contrast figures are that theme's).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Anteprima live + punto «Anteprima non salvata» sul trigger anche chiuso; lock ottimistico con toast. |
| 2 | Match System / Real World | 2 | «FIRE nel 2027 · tra 1 anno» ×3 sotto «Sei già FIRE.»; tick `€100k`; `3.5` col punto negli input; toast «Withdrawal Rate». |
| 3 | User Control and Freedom | 3 | «Annulla» riporta il form; «Ripristina default» istantaneo senza conferma (accettabile: è un'anteprima). |
| 4 | Consistency and Standards | 2 | Asse Scenari parte dal 2027, Ventaglio dal 2026; tre `<Legend>` Recharts contro la regola `SeriesLegend`; aria-label che nomina tinte che il tema non dipinge. |
| 5 | Error Prevention | 2 | SWR/INPS validati solo come toast su «Salva»; `#withdrawalRate` a 150 senza `aria-invalid`; gli input scenari scartano in silenzio i valori fuori range (il campo mostra ciò che hai digitato, il modello lo ignora). |
| 6 | Recognition Rather Than Recall | 3 | «scenari 4/3,5 · 7/2,5 · 10/1,5» nel trigger è un codice; la chiave colore del grafico Traguardo vive nella tessera Scenari, 470 px a destra. |
| 7 | Flexibility and Efficiency | 3 | Roving focus sul toggle; 24 Tab fino a «Parametri» (quasi tutti della shell). |
| 8 | Aesthetic and Minimalist Design | 2 | 190 px di vuoto in Base di calcolo; tre etichette «FIRE Orso/Base/Toro» sovrapposte e clippate a x=2027; «Anni di spesa coperti» va a capo sotto il proprio valore. |
| 9 | Error Recovery | 3 | `ErrorNotice` prima dello skeleton, ordine giusto; ma il ramo «nulla registrato» perde la griglia. |
| 10 | Help and Documentation | 3 | «Come funziona il FIRE» sei definizioni pulite, popover SWR; ma il numero ponte insensibile allo SWR non è spiegato da nessuna parte. |
| **Total** | | **27/40** | **Acceptable (limite alto)** |

## Design Specificity Verdict

**LLM assessment.** Autorata per QUESTO prodotto, non un template: il verdetto risponde a «quando?» prima di ogni numero, l'eroe è il numero FIRE e non l'anno (l'anno è già il titolo), il vincolo pensionistico vive nella tessera Base di calcolo e si salva da solo, il modello ponte è nominato sul sub-eyebrow, RITA / INPS − 5 / INPS − 10 sono parametri di prima classe, il reddito passivo è stampato in ENTRAMBE le monete con l'inflazione nominata. Scivola nel generico esattamente dove i default di Recharts passano: tre `<Legend>` in colore serie, tick `€100k`, centesimi nel tooltip di una proiezione a 50 anni, «Withdrawal Rate» in un toast di un prodotto il cui termine è SWR. Il layer dei grafici non è stato autorato con la cura delle parole.

**Deterministic scan.** CLI `impeccable detect` sugli 8 file: exit 0, 0 findings — legge HTML/CSS, il TSX gli è opaco: nessuna informazione. Overlay in pagina (detect.js iniettato via live-server, 1440 light, disclosure aperte): 112 findings su 77 elementi. **Del pannello: 86** — `low-contrast` 31 (28 sono il token `--muted-foreground` #78716c su tessera #f8f4ee a 4,38:1, il debito di tema già in CLAUDE.md; 3 sono le sotto-tessere scenario a 3,98:1 su #f1e9da), `undersized-ui-text` 22 e `tiny-text` 21 (la rampa enumerata 9/9,5/10/11 px), `nested-cards` 11 (ogni Tile dentro PageContainer, più le tre sotto-tessere scenario: le uniche card-in-card vere), `line-length` 1 (l'aiuto di 11 px sotto «Sblocco del fondo pensione», ~95 caratteri/riga). Non del pannello: 1 in `main` (label «Pianificazione»), 9 della shell, 3 di `body`, 13 rumore del detector stesso.

**Visual overlays.** Nessuna scheda [Human]: il browser dell'estensione non è connesso. L'overlay è stato iniettato in Playwright e fotografato (`B-1440x900-light-expanded-overlay.png` nello scratchpad); non è visibile nel browser dell'owner.

**Misure (B).** Overflow di `main`: 0 a 1440 e 390, 0 offender. Console: 0 errori, 0 richieste fallite, 26 `console.warn` Recharts «width(-1) and height(-1)» (2 per caricamento fresco). Target sotto soglia nel pannello: switch 36×20 (×4 con Parametri aperto), «?» SWR 20×20, a 390 anche i 9 input a 32/36 px e i 3 pulsanti a 36 px; della shell a 390 le 5 tab della PageTabBar a h 32. Contrasto light: 13 nodi a **2,60:1** (`text-muted-foreground/70`, 11 px), legenda «Scenario Orso» 3,11:1 e «Toro» 3,77:1; dark reale (next-themes): i 13 nodi `/70` a 3,74:1, «Toro» 4,18:1, «Salva impostazioni» bianco su primary **2,80:1** (il primary arancio del tema della fixture). Nomi accessibili mancanti: 0. Id duplicati: 0. Tab: 24 pressioni fino a «Parametri», 25 «Dettaglio»; anello di focus presente su ogni elemento.

## Overall Impression

La pagina sa cosa dire e lo dice bene: verdetto onesto al euro e all'anno, il vincolo pensionistico dove va il capitale, un trigger Parametri che non ti lascia mai guardare un'anteprima senza dirtelo. Quello che non regge è il momento più importante: quando il traguardo è raggiunto, il titolo dice «Sei già FIRE.» e tre righe sotto tre scenari dicono «tra 1 anno», con un ventaglio che concorda al 100 %. L'opportunità più grande è una sola riga di motore (l'anno 0 non viene mai testato) più il layer dei grafici riportato alle regole della casa.

## What's Working

1. **Il verdetto è onesto al euro e all'anno** (`lib/utils/fireNarrative.ts:130-219`): reddito passivo in entrambe le monete con l'inflazione nominata; sotto il ponte la clausola diventa «gli asset liberi coprono … poi rientra il fondo pensione»; un'età mancante perde la clausola. L'anteprima lo tiene vero sotto modifica (misurato: 4 → 3,5 % riscrive «al 3,5% rende 152 €» all'istante).
2. **Il vincolo pensionistico è nel posto giusto e si impegna da solo** (`tiles/BaseDiCalcoloTile.tsx:79-93`): accanto alla cifra che muove, con la regola in didascalia («29.800 € fino al 2048, a 57 anni (regola RITA)»), la ragione del disabilitato in copy visibile, e il footer che dice dove vivono i parametri digitati.
3. **Disclosure config-first con trigger veritiero** (`FireCalculatorTab.tsx:290-312`): nomina ogni impostazione salvata, accende il punto ambra «Anteprima non salvata» e si riapre su ogni modifica non salvata.

## Priority Issues

**[P1] La pagina contraddice il proprio verdetto quando il FIRE è raggiunto.** *What*: tessera Scenari «2027 · tra 1 anno» su tutte e tre le righe e lettura «Nel base il FIRE arriva nel 2027», footer del Ventaglio «Probabilità di FIRE entro il 2027: 100%», sotto il titolo «Sei già FIRE.» (screenshot A-desktop-1, B-1440x900-light-collapsed). *Why*: Narrative Honesty Rule — chi è FIRE oggi si sente dire tre volte che manca un anno. Causa verificata sul codice: `calculateFIREProjection` apre il ciclo a `year = 1` (`lib/services/fireService.ts:1509`) e non testa mai la condizione all'anno 0; `summarizeScenarios` (`lib/utils/fireSummary.ts:115`) e `resolveFanVerdict` (`:241`) la passano avanti. *Fix*: verificare il raggiungimento all'anno 0 prima del ciclo (`yearsToFIRE = 0`), rendere 0 come «già raggiunto» in `describeScenarios`/`ScenariTile.distance` (mai «tra 0 anni»), ancorare il verdetto del ventaglio all'anno 0 quando il target è raggiunto; una falsificazione Vitest su una fixture con `netWorth ≥ fireNumber`. *Command*: `/impeccable polish` (poi `/impeccable clarify` sulle parole della tessera Scenari).

**[P1] Le tre legende sono `<Legend>` di Recharts e l'aria-label promette tinte che il tema non dipinge.** *What*: `FIREProjectionChart.tsx:137` dice «Orso (rosso) … Toro (verde)», ma orso → slot 4, toro → slot 1 (`:119-121`): sul tema della fixture l'Orso È verde e il Toro È blu (screenshot A-desktop-6). `:155`, `FireDettaglio.tsx:139,177` rendono `<Legend>`: etichette in colore serie misurate 3,11 / 3,77:1 light, «Toro» 4,18:1 dark, icone nominate in inglese («legend icon»). *Why*: AGENTS § Recharts («the legend is `SeriesLegend`, never `<Legend>`», dal 2026-09-20) e § Accessibility (mai un nome di tinta risolto dal tema); AA. *Fix*: togliere le tinte dall'aria-label (serie e linea tratteggiata, basta); sostituire le tre `<Legend>` con `components/ui/series-legend.tsx`; valutare che la colonna swatch della tessera Scenari SIA la legenda del grafico, così tessera e grafico condividono una chiave. *Command*: `/impeccable harden`.

**[P1] Lo stato «nulla registrato» perde la griglia e non offre un'azione.** *What*: `FireCalculatorTab.tsx:638-648` — senza spese (o senza patrimonio positivo) il tab rende verdetto + due disclosure e NESSUNA tessera; il verdetto dice «Servono spese registrate nel Cashflow» ma niente porta al Cashflow o al Patrimonio. Lo spacer `hidden desktop:block` a `:726` è una seconda assenza muta nella cella Scenari. *Why*: The Absence-Has-Three-Names Rule — la domanda della tessera resta visibile proprio quando non può rispondere, e la tessera che possiede l'assenza offre UNA azione; qui zero. Non riprodotto dal vivo (la fixture ha dati): la tesi è dal codice. *Fix*: tenere le quattro tessere con `EmptyState` (Traguardo possiede l'azione «Registra le spese» → Cashflow; Base di calcolo stampa il patrimonio che ha), sostituire lo spacer con un EmptyState nella cella Scenari. *Command*: `/impeccable clarify`.

**[P2] Base di calcolo è una tessera 3×2 con 190 px di niente.** *What*: misurata 277×718 accanto a Traguardo 470×718; il contenuto finisce allo switch (bottom 685) e il footer parte a 875: `margin-top` calcolato **189,9 px** (screenshot A-desktop-7). *Why*: AGENTS § Hierarchy — «a tile stretched beside a taller neighbour is cured in the GRID, never in the tile»; il vuoto si legge come righe mancanti. *Fix*: Base di calcolo su UNA riga (`desktop:col-span-3` senza `row-span-2`) e Reddito passivo + Scenari che si dividono le 7 colonne sotto Traguardo, oppure Base 3 + Reddito 4 in prima riga e Scenari 7 in seconda; in ogni caso le tessere condividono una riga solo con tessere della propria altezza (`FireCalculatorTab.tsx:678-728`). *Command*: `/impeccable layout`.

**[P2] Le didascalie a `/70` falliscono AA in entrambi i modi; il pulsante primario in dark 2,80:1.** *What*: `text-muted-foreground/70` a 11 px = 2,60:1 light / 3,74:1 dark su 13 nodi (`BaseDiCalcoloTile.tsx:50,83`, `RedditoPassivoTile.tsx:34`, `ScenariTile.tsx:55,64`) — e portano FATTI («124 € al mese», «fondo pensione bloccato escluso»); «Salva impostazioni» bianco su `bg-primary` arancio misura 2,80:1 in dark sul tema della fixture (`FireParametri.tsx:226`), le tre sotto-tessere scenario 3,98:1 su `bg-muted`. *Why*: AA; una didascalia che dice il periodo o la regola non è decorazione. *Fix*: togliere `/70` (il token pieno misura 4,38 light / 6,08 dark qui — e la sua soglia è il debito di tema in CLAUDE.md, non di questa pagina); il primary dark è del blocco tema, da segnare per `doc/guide/temi.md`. *Command*: `/impeccable harden`.

**[P3] Dialetti di numero e valuta.** Tick `€100k` / `€0` (`formatCurrencyCompact`, `chartService.ts:338`, usato in `FIREProjectionChart.tsx:144`, `FireFanChart.tsx:201`, `FireDettaglio.tsx:175`) contro la regola «€ dopo, spazio no-break»; tooltip della proiezione con centesimi (`FIREProjectionChart.tsx:96,99`); toast «Inserisci un Withdrawal Rate valido» (`FireCalculatorTab.tsx:532`); gli `<input type=number>` mostrano `3.5` (limite del controllo nativo, da dichiarare o sostituire con `inputMode=decimal` + testo). *Command*: `/impeccable polish`.

## Persona Red Flags

**Alex (power user)**: cambia lo SWR e l'eroe non si muove (il pavimento del ponte lega) senza una frase che lo dica — screenshot A-desktop-11: l'eroe resta 20.585 € mentre «senza il vincolo sarebbe» passa a 42.667 €; gli input scenari ignorano in silenzio i valori fuori range (`FireParametri.tsx:96-102`); col Ventaglio aperto ogni tasto su un campo scenario ri-esegue 1000 percorsi (`fanResult` dipende da `fanInputs` → `scenarios.base.inflationRate`, `FireCalculatorTab.tsx:388,396`).

**Sam (screen reader + tastiera)**: sente «Orso (rosso)» che può essere verde; sente «252,4% verso FI» su un traguardo superato (`TraguardoTile.tsx:75-78`: «verso» è una direzione che non hai più); le legende sono nascoste da `role="img"`, quindi l'aria-label è l'unica chiave; SWR a 150 senza `aria-invalid`, l'unico errore è un toast dopo Salva; i paragrafi di aiuto sotto gli input non sono `aria-describedby`. L'ordine di Tab è sano (24 stop a Parametri, il tabpanel è uno stop, il focus resta sul trigger dopo Invio).

**Giulia (38 anni, fondo pensione, guarda il piano ogni mese)**: la didascalia del vincolo «29.800 € fino al 2048, a 57 anni (regola RITA)» è la riga migliore della pagina; ma «Disoccupato ≥ 24 mesi dopo il FIRE» + «Anticipa lo sblocco a INPS − 10 anni» è una clausola legale senza popover, a differenza dello SWR; «manca la tua età (in Coast FIRE)» la manda in un altro tab senza link; il mese in cui supera la linea il confetti la accoglie su ogni dispositivo, poi la tessera Scenari le dice «tra 1 anno».

## Minor Observations

- Reddito passivo «Anni di spesa coperti»: il valore `shrink-0` con lo split inline manda a capo l'etichetta («Anni di spesa / coperti», A-desktop-8) — lo split va in didascalia sotto l'etichetta (`RedditoPassivoTile.tsx:63-75`).
- Tre etichette `ReferenceLine` «FIRE Orso/Base/Toro» a `position: 'top'` si sovrappongono quando gli anni coincidono e sono clippate dal margine superiore (`FIREProjectionChart.tsx:198-224`): nel DOM, invisibili nello screenshot.
- La vista Scenari parte dall'anno 1 (2027), il Ventaglio dall'anno 0 (2026): due viste di una tessera non concordano su dove sta «oggi».
- `formatRate` è copiato in quattro file (`fireNarrative.ts:43`, `BaseDiCalcoloTile.tsx:58`, `RedditoPassivoTile.tsx:43`, `ScenariTile.tsx:34`) — Rule of Three.
- Il trigger Parametri comprime cinque fatti in una riga, l'ultimo in notazione «4/3,5» (`fireNarrative.ts:452-459`).
- Il confetti (`FireCalculatorTab.tsx:553-561`) usa hex emerald/amber su qualunque tema — debito già dichiarato in DESIGN.md (riga 386: «a canvas cannot read a CSS variable»), non una scoperta; ma Storico ha ritirato il suo il 2026-09-13 e questo è l'ultimo rimasto, ed esplode proprio sopra la contraddizione P1.
- Console: 2 warn Recharts «width(-1) and height(-1)» per caricamento — i grafici `height="100%"` montano prima che il box assoluto abbia misura; innocui, ma un giorno nasconderanno un warning vero.
- Il progressbar espone `aria-valuenow` 100 su un 252 %: corretto il cap, ma manca `aria-valuetext` che dica il vero.
- La sotto-tessera scenario (`rounded-xl border bg-muted`) è la sola card-in-card della pagina: DESIGN.md la tiene come Muted Sub-tile Variant B, quindi voluta.
- Della shell, non di questa tab: le 5 tab della PageTabBar a h 32 a 390; label «Pianificazione» 10 px.

## Questions to Consider

1. Se il numero FIRE è l'eroe e l'anno è il titolo, perché la tessera Scenari — l'unica che elenca anni — sta nell'angolo in basso a destra e non sotto il verdetto che ha nominato un anno?
2. Il numero ponte è «insensibile all'anno di sblocco finché il pavimento non lega» e, su questa fixture, anche allo SWR. È un eroe giusto una cifra che ignora il parametro principale della pagina, o la tessera dovrebbe stampare le due fasi («fino al 2048 servono X; dal 2048 il fondo copre Y») così il lettore vede cosa si muove e cosa no?
3. Storico ha rinunciato al confetti perché la pagina era «migliore ancora». Cosa manca a «Sei già FIRE.» — una frase che nomina il reddito passivo contro le spese, che già ha — perché lo scoppio sia ridondante anche qui?
