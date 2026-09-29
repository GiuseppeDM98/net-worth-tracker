# Composizione mobile — analisi, misure e specifiche

> Sessione del 2026-09-26, dalla domanda del proprietario: «l'app è densa di informazioni in ogni sua parte, ed è
> questo che le va contro sul telefono: lì guardo al massimo 4–5 informazioni». Questa cartella tiene UNA specifica per
> implementazione (`MOB-NN-*.md`, sul template di `doc/perf/`, ognuna con il prompt e il modello in coda), il censimento
> di riferimento in `reference/` e questo indice: la domanda con la risposta, come è stato misurato il mobile attuale,
> la baseline, le tre direzioni disegnate e quella scelta, l'ordine consigliato e lo stato. **Si implementa DOPO le 14
> spec di `doc/perf/`** (decisione del proprietario): PERF-02 (in develop dal 2026-09-29) e PERF-03 cambiano la shell che il mobile eredita, PERF-04/11/12/14
> toccano gli stessi componenti. Una spec che si chiude aggiorna la tabella in § 6 e, se ha rimisurato, la baseline in § 3.

## 1. La domanda e la risposta

**Vale la pena un design ad hoc per mobile e tablet?** Sì, ma come **composizione**, non come secondo design system.
DESIGN.md impone «mobile-first a 390, il desktop aggiunge colonne, non semplifica mai»: la conseguenza, misurata, è che
a 390 ogni pagina è la stessa griglia desktop messa in colonna — 3–8 tessere una sotto l'altra, ognuna con eyebrow,
lettura e figure — e la prima schermata contiene il verdetto e l'INIZIO di una tessera, mai una intera, con 2–5
schermate di scroll sotto (mediana 3,8). Il telefono porta tutto quello che porta il desktop, solo più lungo.

L'architettura «verdetto sopra le tessere» è però già l'ossatura giusta per un telefono: una frase che risponde alla
domanda della pagina, poi tessere che rispondono a UNA domanda ciascuna. Il mobile non ha bisogno di tessere nuove né
di token nuovi: ha bisogno di una SELEZIONE diversa (cosa sta nella prima schermata) e di una DIVULGAZIONE diversa (il
resto a un tap, non in fondo a uno scroll). Un linguaggio visivo diverso per mobile raddoppierebbe DESIGN.md, i dodici
temi, la regola degli stati su venti superfici e quaranta modali: escluso.

## 2. Come è stato misurato

- **Uno script Playwright usa-e-getta** (`reference/mobile-census.mjs`, Chromium headless, `isMobile` + `hasTouch`,
  locale it-IT) sul dev server degli emulatori (`npm run dev:emulator`, :3000) con il **mirror del proprietario**
  (`npm run mirror:seed -- <email>`: 25 asset, 1533 spese, 45 snapshot; rimosso a fine sessione). Per 19 superfici
  (11 route, con Cashflow e FIRE contate per tab: 9 + 5 + 5) a **390×844**, **768×1024** e **1024×768**: login vero,
  attesa di `h1` + prima cifra in euro + nessuno skeleton, poi 3 s per i count-up.
- **Le misure** (tutto relativo a `main`, che è lo scroller dell'app): `screens` = `scrollHeight / clientHeight`;
  le tessere visibili (`section.rounded-2xl`, `checkVisibility()`: le tab `forceMount` nascoste non contano) con
  `top`, altezza, cifre e parole; le cifre (`\d[\d.,]*\s?(€|%)`) e le parole totali e «sopra la piega» (il nodo
  inizia nella prima schermata); i controlli; i grafici; le tablist; `scrollWidth > clientWidth`. Due screenshot per
  superficie (prima schermata e pagina intera con `main` sbloccato).
- **Cosa NON misura**: i tempi (dev server, non build di produzione: la baseline dei tempi è `doc/perf/README.md § 3`);
  la differenza fra cifre «nel verdetto» e «fuori» (le ha contate lo script a mano nelle tre pagine dei mock; MOB-01
  la rende una misura). I dati grezzi (JSON e screenshot) restano fuori dal repo: portano le cifre reali.

## 3. Baseline (2026-09-26, mirror, dev server)

> Presa PRIMA dei contributi del 2026-09-27. Da #401 la riga **Analisi a 390** cambia: sotto i 640 px il Flusso non è più
> un Sankey, `charts` scende da 2 a 1, cifre e controlli salgono, le schermate sono da rimisurare; a 768 e 1024 no. Dal
> 2026-09-28 (la nuova Esposizione, #407) cambiano le righe **Allocazione** (la base dell'Esposizione e la riga di copertura). #400 a interruttore spento
> e #403 non muovono righe. MOB-01 rimisura: il budget nasce con i contributi dentro.

`screens` = schermate di scroll. `tiles` = tessere visibili (sopra la piega = che INIZIANO nella prima schermata;
«fully» = interamente dentro). `figures` = cifre € o % (totali / sopra la piega). `words` = parole (totali / sopra la
piega). `controls` = bottoni, link, tab, input (totali / sopra la piega).

### 390 × 844 (telefono)

| Superficie | screens | tiles (above / fully) | figures | words | controls | charts |
|---|---|---|---|---|---|---|
| Panoramica | 4,41 | 8 (1 / 0) | 107 / 20 | 535 / 156 | 21 / 7 | 0 |
| Patrimonio | 5,52 | 7 (1 / 0) | 221 / 17 | 1398 / 141 | 124 / 8 | 13 |
| Cashflow › Tracciamento | 4,34 | 5 (1 / 0) | 60 / 16 | 559 / 153 | 33 / 7 | 2 |
| Cashflow › Budget | 3,27 | 5 (1 / 0) | 64 / 15 | 480 / 151 | 26 / 8 | 1 |
| Cashflow › Centri | 1,92 | 3 (2 / 1) | 20 / 10 | 249 / 133 | 10 / 7 | 1 |
| Cashflow › Divisione | 1,90 | 4 (1 / 0) | 43 / 19 | 269 / 150 | 7 / 7 | 0 |
| Cashflow › Dividendi | 3,77 | 6 (1 / 0) | 36 / 8 | 473 / 112 | 24 / 11 | 2 |
| Analisi | 4,23 | 6 (1 / 0) | 56 / 12 | 571 / 142 | 32 / 6 | 2 |
| Rendimenti | 4,71 | 8 (1 / 0) | 53 / 7 | 640 / 155 | 27 / 9 | 2 |
| Storico | 5,05 | 5 (1 / 0) | 103 / 15 | 754 / 138 | 27 / 1 | 3 |
| Allocazione | 5,25 | 5 (2 / 1) | 194 / 27 | 1032 / 168 | 27 / 7 | 1 |
| Previdenza | 3,84 | 5 (1 / 0) | 59 / 16 | 623 / 139 | 9 / 2 | 0 |
| FIRE › Calcolatore | 3,37 | 4 (1 / 0) | 49 / 15 | 579 / 193 | 11 / 8 | 1 |
| FIRE › Coast | 2,75 | 3 (1 / 0) | 49 / 17 | 506 / 176 | 9 / 5 | 1 |
| FIRE › What If | 4,57 | 4 (1 / 0) | 82 / 18 | 710 / 167 | 25 / 16 | 1 |
| FIRE › Monte Carlo | 5,05 | 4 (1 / 0) | 34 / 7 | 617 / 151 | 48 / 5 | 2 |
| FIRE › Obiettivi (vuoto sul mirror) | 1,00 | 1 (1 / 1) | 0 / 0 | 51 / 51 | 6 / 6 | 0 |
| Hall of Fame | 3,43 | 5 (1 / 0) | 49 / 17 | 555 / 185 | 11 / 2 | 1 |
| Impostazioni | 2,11 | 3 (2 / 1) | 9 / 5 | 211 / 153 | 31 / 13 | 0 |

Lettura: su OGNI pagina con dati la prima schermata contiene il verdetto e l'inizio di UNA tessera; le cifre sopra la
piega (7–27) sono quasi tutte DENTRO il verdetto (Panoramica: 20 sopra la piega, il verdetto è alto 315 px e la tessera
hero 709 px; Tracciamento: la tessera Movimenti è alta 1587 px). Le pagine più lunghe: Patrimonio 5,5 · Allocazione
5,3 · Storico 5,1 · Monte Carlo 5,1 · Rendimenti 4,7.

### 768 × 1024 (tablet portrait) e 1024 × 768 (tablet landscape)

| Superficie | 768: screens | 768: tiles (above / fully) | 768: figures | 1024: screens | 1024: tiles (above / fully) | 1024: figures |
|---|---|---|---|---|---|---|
| Panoramica | 2,39 | 8 (3 / 1) | 107 / 43 | 3,11 | 8 (1 / 0) | 107 / 22 |
| Patrimonio | 3,46 | 7 (3 / 1) | 221 / 33 | 4,60 | 7 (1 / 0) | 221 / 23 |
| Cashflow › Tracciamento | 3,14 | 5 (3 / 1) | 60 / 30 | 4,21 | 5 (1 / 0) | 60 / 16 |
| Cashflow › Budget | 2,35 | 5 (3 / 1) | 64 / 21 | 2,98 | 5 (1 / 0) | 64 / 15 |
| Cashflow › Centri | 1,46 | 3 (2 / 1) | 20 / 19 | 1,74 | 3 (1 / 0) | 20 / 10 |
| Cashflow › Divisione | 1,25 | 4 (4 / 2) | 43 / 39 | 1,55 | 4 (1 / 0) | 43 / 19 |
| Cashflow › Dividendi | 2,39 | 6 (3 / 1) | 36 / 18 | 3,16 | 6 (1 / 0) | 36 / 7 |
| Analisi | 2,89 | 6 (3 / 1) | 56 / 29 | 3,87 | 6 (1 / 1) | 56 / 12 |
| Rendimenti | 2,75 | 8 (3 / 1) | 53 / 12 | 3,62 | 8 (1 / 0) | 53 / 7 |
| Storico | 3,20 | 5 (3 / 1) | 103 / 28 | 4,20 | 5 (1 / 0) | 103 / 16 |
| Allocazione | 3,34 | 5 (2 / 1) | 194 / 50 | 4,27 | 5 (2 / 1) | 194 / 36 |
| Previdenza | 2,34 | 5 (3 / 1) | 59 / 32 | 2,97 | 5 (1 / 0) | 59 / 16 |
| FIRE › Calcolatore | 2,01 | 4 (3 / 1) | 49 / 19 | 2,58 | 4 (1 / 0) | 49 / 15 |
| FIRE › Coast | 1,72 | 3 (2 / 1) | 49 / 24 | 2,14 | 3 (1 / 0) | 49 / 17 |
| FIRE › What If | 3,45 | 4 (1 / 0) | 82 / 25 | 4,64 | 4 (1 / 0) | 82 / 18 |
| FIRE › Monte Carlo | 2,75 | 4 (2 / 1) | 34 / 9 | 3,58 | 4 (1 / 0) | 34 / 8 |
| FIRE › Obiettivi | 1,00 | 1 (1 / 1) | 0 / 0 | 1,00 | 1 (1 / 1) | 0 / 0 |
| Hall of Fame | 2,17 | 5 (3 / 1) | 49 / 34 | 2,85 | 5 (1 / 0) | 49 / 17 |
| Impostazioni | 1,35 | 3 (3 / 2) | 9 / 7 | 1,68 | 3 (3 / 2) | 9 / 7 |

Lettura: a 768 la griglia a due colonne dimezza lo scroll (mediana ~2,4 schermate) e porta tre tessere sopra la piega,
una intera; a 1024 landscape (768 px di altezza) si torna a UNA tessera sopra la piega e ~3,1 schermate (mediana 3,11). La composizione
attuale premia il portrait e penalizza il landscape.

### Le tessere a 390 delle tre pagine dei mock (top e altezza in px da inizio `main`)

| Panoramica (navbar 66, verdetto 315) | top | h | cifre |
|---|---|---|---|
| Patrimonio totale lordo | 432 | 709 | 14 |
| Cashflow · mese | 1153 | 286 | 10 |
| Sintesi patrimoniale | 1451 | 294 | 11 |
| Composizione | 1757 | 403 | 16 |
| Costi | 2172 | 322 | 12 |
| Spese per categoria | 2506 | 387 | 15 |
| Entrate per categoria | 2905 | 348 | 12 |
| Asset principali | 3265 | 288 | 13 |

| Cashflow › Tracciamento (navbar 66, verdetto 148) | top | h | cifre |
|---|---|---|---|
| Cashflow · periodo | 373 | 521 | 9 |
| Spese per categoria | 906 | 354 | 15 |
| Entrate per categoria | 1273 | 316 | 12 |
| Risparmio nel tempo | 1600 | 293 | 3 |
| Movimenti | 1906 | 1587 | 24 |

| Rendimenti (navbar 74, verdetto 153) | top | h | cifre |
|---|---|---|---|
| Rendimento (TWR) | 478 | 585 | 5 |
| Rischio | 1075 | 337 | 3 |
| Consistenza | 1425 | 281 | 15 |
| Benchmark | 1718 | 408 | 9 |
| Contributi | 2137 | 469 | 11 |
| Da dove viene il rendimento | 2619 | 598 | 13 |
| Plusvalenze realizzate | 3228 | 135 | 1 |
| Capitale e mercato | 3375 | 331 | 3 |

## 4. Le tre direzioni disegnate e la scelta

Tre direzioni, tutte «composizione» (stesse tessere, token e narrative), disegnate come artboard (390×844 chiaro e
scuro, 768×1024, Cashflow › Tracciamento, Rendimenti, lo stato dopo l'interazione firma) su cifre INVENTATE — la
Panoramica sul profilo d'esempio della landing (`lib/utils/landingSampleData.ts`), le altre su cifre tonde coerenti —
mai su quelle del mirror. Ognuna costruita da un agente, messa alla prova da un revisore avversario (15 · 13 · 14
difetti, quasi tutti corretti) e confrontata. Il canvas (privato del proprietario):
https://claude.ai/artifact/JQcXUcUt55HeiUUeP2EMNh.

| | A · Prima schermata | B · Il diario dei verdetti | C · Schede a scorrimento |
|---|---|---|---|
| Tesi | verdetto breve · striscia di ≤4 cifre · LA tessera aperta · il resto in righe chiuse con il loro eyebrow | la Panoramica mobile è il feed dei verdetti delle 12 pagine; le pagine sono 1–2 tessere + «Il resto · N» | verdetto e indice fermi, una tessera per schermata, swipe |
| Cifre fuori dal verdetto (Panoramica / Tracciamento / Rendimenti) | 5 / 5 / 5 | 3 / 5 / 3 | 5 / 7 / 4 |
| Shell | invariata | la Panoramica cambia natura | il 28% dello schermo fisso |
| Costo | `PageVerdict`, `Tile`, `PageHeader`, `PageTabBar` | + `DiaryRow`, un endpoint aggregato (contro `doc/perf/`), una regola «una cifra per pagina» | + un `TilePager` con cinque regole proprie |
| Rischio principale | 16–36 px sopra la pill; le clausole del verdetto dietro un tap | una cifra per pagina può smentire la pagina | screen reader: 1 tessera su 8; swipe dal bordo su iOS |

**Scelta (proprietario, 2026-09-26): A come base su tutte le pagine.** Da C si prendono due cose che servono comunque:
l'eyebrow in `--destructive` su una riga chiusa in lettura fallita, e Plusvalenze realizzate che oggi SPARISCE in
silenzio se il registro non si legge (deve diventare un `ErrorNotice`). Il diario (B) e il pager (C) non entrano.
Dove le tre convergevano — e che quindi si fa comunque: `PageTabBar` a 44 px; il titolo del verdetto sempre visibile e
mai tagliato; la base di Rendimenti fuori da ogni disclosure; una lettura fallita visibile anche chiusa; Movimenti
intera; molla 400/35 e nessuna animazione con reduced motion; a 1024 la barra in alto al posto della pill.

Le quattro regole nominate che la composizione introduce (testo definitivo in MOB-09, per mano del proprietario):
**The First-Screen Rule** (verdetto breve, striscia ≤4 cifre lette dai riassunti delle tessere, UNA tessera aperta, il
resto righe chiuse), **The Lifted-Figure Rule** (una cifra sollevata nella striscia non è ristampata dalla tessera sul
telefono), **The Closed-Row Rule** (una riga chiusa è ancora la tessera: eyebrow `<h3>`, aside in parole, pannello
presente e vuoto, contenuto montato all'apertura; una lettura fallita non si chiude da sola), **The Binding-Clause
Rule** (una clausola che cambia il senso di una cifra stampata non sta mai dietro un tap).

## 5. Ordine consigliato e dipendenze

Gli archi (A → B = «B dipende da A»), gli stessi dell'intestazione di ogni spec; tutte le MOB dopo TUTTE le PERF:

| Da | A |
|---|---|
| PERF-01 | MOB-01 |
| PERF-00 | MOB-01, MOB-07 |
| MOB-01 | 02, 03, 04, 05, 06, 07, 08 |
| MOB-02 | 03, 04, 05, 06, 07, 08 |
| MOB-03, 04, 05, 06, 07 | 08, 09 |
| MOB-08 | 09 |

I contributi esterni del 2026-09-27 (#400, #401, #403) sono già in `develop`, e la nuova Esposizione (PERF-00, #407) è entrata il 2026-09-28,
prima di PERF-01: MOB-01 misura un'app che li contiene, e MOB-06 e MOB-07 compongono il Flusso e l'Esposizione come sono
DOPO quei contributi (`doc/perf/README.md` § 5).

MOB-01 va prima di tutto, come PERF-01: le altre si chiudono con i suoi numeri. MOB-02 è il CONTRATTO che sette spec
citano alla lettera (la tabella delle API in § 4.1): le due decisioni di fondazione che pone — l'ordine del DOM e la
posizione dell'asse (§ 4.9, domande 8 e 9) — vanno risposte e scritte qui in § 9 PRIMA di aprire MOB-03, o si rifanno
sette pagine. Dopo MOB-02 quattro sessioni possono partire in parallelo (MOB-03, 04, 06, 07) e MOB-05 subito dopo; i
moduli condivisi (`PatrimonioTile`, `salesNarrative`, `scheduledSentence`, `playwright.config.ts`, `budget.json`) vanno
a chi arriva prima, e le spec dicono in § 3 chi possiede cosa. MOB-08 (tablet) vuole le pagine composte; MOB-09 chiude
la serie: finché manca, DESIGN.md dice il contrario del codice.

Un avvertimento del passaggio di coerenza, da tenere davanti: **il budget della prima schermata rischia di diventare
una lista di eccezioni** — le clausole vincolanti annullano il taglio del verdetto, le tessere eroe sono alte 585–709 px,
e si misura sul mirror, che cambia con il giorno del mese. Le domande comuni in § 10 vanno risposte una volta, non spec
per spec.

## 6. Stato

| Spec | Titolo | Priorità | Sforzo | Dipende da | Modello · effort | Stato |
|---|---|---|---|---|---|---|
| [MOB-01](MOB-01-censimento-e-budget-prima-schermata.md) | Il censimento in repo e il budget della prima schermata | 1 | M | PERF-01, PERF-00 (chiusa il 2026-09-28) | Opus 5.5 · high | da fare |
| [MOB-02](MOB-02-primitive-della-composizione.md) | Le primitive della composizione | 1 | L | MOB-01, PERF-12, PERF-14 (con PERF-02; PERF-03) | Fable 5.1 · xhigh | da fare |
| [MOB-03](MOB-03-panoramica.md) | Panoramica | 2 | M | MOB-02, PERF-03, PERF-07 | Fable 5.1 · high | da fare |
| [MOB-04](MOB-04-cashflow-cinque-tab.md) | Cashflow: le cinque tab | 2 | L | MOB-02, PERF-06 | Fable 5.1 · xhigh | da fare |
| [MOB-05](MOB-05-rendimenti.md) | Rendimenti | 2 | M | MOB-02, PERF-09 | Fable 5.1 · high | da fare |
| [MOB-06](MOB-06-patrimonio-analisi-storico-hall-of-fame.md) | Patrimonio · Analisi · Storico · Hall of Fame | 3 | L | MOB-02, PERF-11 | Opus 5.5 · high | da fare |
| [MOB-07](MOB-07-allocazione-previdenza-fire.md) | Allocazione · Previdenza · FIRE | 3 | L | MOB-02 (PERF-04, 05, 10 chiuse; PERF-00 chiusa il 2026-09-28) | Fable 5.1 · high | da fare |
| [MOB-08](MOB-08-tablet-768-e-1024.md) | Tablet: 768 e 1024 | 3 | M | MOB-03..07 (PERF-01, 02, 14) | Opus 5.5 · high | da fare |
| [MOB-09](MOB-09-design-md-guide-e-chiusura.md) | DESIGN.md, guide e chiusura | 3 | M | MOB-03..08 | Opus 5.5 · high | da fare |

Effort = il livello di ragionamento di Claude Code. Fable 5.1 dove il lavoro attraversa regole di dominio dense (le
narrative e le clausole vincolanti, Cashflow, Rendimenti, Pianificazione); Opus 5.5 dove è meccanico ma esteso (il
censimento, le pagine di analisi sul contratto già scritto, il tablet, la documentazione). Ogni spec è stata verificata
da un revisore avversario contro il codice del 2026-09-26 (161 affermazioni corrette in tutto: `file:riga`, nomi di API,
regole di dominio, template) e poi allineata a MOB-02 da un passaggio di coerenza; le righe citate sono di quel giorno e
chi implementa le riverifica, perché nel frattempo le PERF riscrivono i caricamenti.

## 7. Cosa NON fare (deciso il 2026-09-26)

- Un secondo design system per il mobile (tipografia, chrome, token propri): raddoppia DESIGN.md, temi, stati e modali.
- Il diario dei verdetti (B) e il pager orizzontale (C): scartati con motivazione in § 4.
- Rigenerare DESIGN.md: MOB-09 propone il testo, il proprietario lo applica.
- Cifre reali del proprietario nei mock, nelle spec, nel budget o nel draft delle release notes: cifre tonde inventate
  e nomi generici, sempre.
- Implementare prima delle perf: PERF-02/03/04/11/12/14 toccano gli stessi componenti.
- Chiudere una spec «a sensazione»: ogni spec dichiara la sua misura in § 2 (`mobile:budget`) e la riporta qui.

## 8. Come si rimisura

Fino a MOB-01: `reference/mobile-census.mjs` copiato nella radice del repo come `.tmp-mobile-measure.mjs` (`import
'playwright'` risolve da lì), emulatori + mirror + `npm run dev:emulator`, poi
`node .tmp-mobile-measure.mjs --out=<cartella fuori dal repo>` (opzioni `--viewports=390,768,1024`,
`--surfaces=panoramica,rendimenti`), cancellato a fine sessione; il JSON e gli screenshot restano fuori dal repo. Da
MOB-01: `npm run mobile:census` e `npm run mobile:budget` sulla build di produzione di `perf:build`, servita da `perf:serve` (:3200), con il `--` di
npm davanti alle opzioni.

## 9. Decisioni del proprietario (2026-09-26)

- Sì al design ad hoc, come **composizione mobile** (stesse tessere, token, narrative, route): cambia la prima
  schermata (verdetto + ≤4–5 cifre) e come si arriva al resto (un tap).
- **Una sola composizione «schermo piccolo»** per telefono e tablet: due colonne dai 768, al più tre a 1024; `desktop:`
  resta l'unico switch, `lg:` resta vietato.
- **Direzione A** come base; da C l'eyebrow rosso e Plusvalenze in errore; niente diario, niente pager.
- **Il verdetto sul telefono = titolo + prima frase**, il resto dietro «Il perché»; una clausola che cambia il senso di
  una cifra (tasse su una vendita, base misurata, calendario) resta sempre visibile.
- **Una tessera sul telefono non ripete** ciò che striscia o verdetto hanno stampato; torna intera dal tablet.
- **Le sezioni aperte si ricordano per pagina** (`localStorage`, per dispositivo).
- Prima le 14 spec di `doc/perf/`, poi queste.
- **Decisioni di fondazione (2026-09-27, prima di MOB-02/MOB-03)**: (1) **una sequenza sola** — nessun riordino
  CSS, l'ordine del DOM è l'ordine di lettura su ogni dispositivo, e dove LA tessera non è già la prima della griglia si
  sposta anche sul desktop (chiude AGENTS § Hierarchy vs `doc/guide/patrimonio.md`: vale la seconda); (2) **l'asse sotto
  `desktop:` è uno slot `axis` di `PageVerdict`**, sotto il titolo e prima della striscia, nella stessa `section` del
  verdetto; (3) **deroga «solo titolo» ammessa e dichiarata** (`leadLength: 0`) quando la prima frase ristamperebbe ≥ 2
  cifre della striscia, le clausole vincolanti sempre fuori; (4) **con LA tessera alta cede la curva (~120 px sotto
  `desktop:`), mai la lettura**: il budget resta vero senza eccezioni; (5) **il builder ripunteggia anche a 1440** (un «;»
  che diventa «.») dove serve al taglio; (6) **il budget di MOB-01 si misura su un fixture deterministico**, il mirror
  resta per il giro guidato; (7) **una «cifra» è solo € e %**, come la baseline; (8) **la stessa cifra può ripetersi nel
  paragrafo aperto di «Il perché», mai nella tessera**.
- **Il Flusso di Analisi sceglie il disegno a 640 px (2026-09-27, con l'integrazione di #400 e #401)**: sotto, una barra
  di quote e le righe; da 640 a 1439 il Sankey. È una soglia di leggibilità del GRAFICO, non una seconda composizione:
  «una sola composizione» e «`desktop:` unico switch» valgono per griglia, striscia e righe, e restano. Un grafico può
  cambiare disegno sotto la larghezza in cui smette di leggersi; mai cifre né atterraggi, e le sue didascalie vengono da
  `analisiNarrative.ts` come ogni altra frase (MOB-06 § 4.2, MOB-08 § 4.1, MOB-09 § 4.1).

## 10. Domande aperte al proprietario

Le spec le pongono in § 4 con la prova; qui l'elenco deduplicato. Le comuni 1–6 e, di MOB-01, «mirror o fixture» e
«cosa è una cifra» sono DECISE il 2026-09-27: vedi § 9. Restano aperte le altre (il podio di Hall of Fame nel budget compreso).

**Comuni a più spec**
1. ~~Deroga «solo titolo»~~ — decisa: ammessa e dichiarata (§ 9).
2. ~~L'ordine del DOM~~ — deciso: una sequenza sola, nessun riordino CSS (§ 9).
3. ~~L'asse~~ — deciso: slot `axis` di `PageVerdict` (§ 9).
4. ~~Tessera alta~~ — deciso: la curva si accorcia, mai la lettura (§ 9).
5. ~~Punteggiatura a 1440~~ — deciso: sì, il builder ripunteggia anche a 1440 (§ 9).
6. ~~Stessa cifra due volte~~ — deciso: nel paragrafo aperto sì, nella tessera no (§ 9).
7. Un blocco sollevato che porta con sé una cifra che nessuno ristampa (l'euro del chip dell'anno, il chip «dal
   massimo», «€ da spostare») (MOB-03, 05, 07).
8. La didascalia del calendario anche a 1440 (MOB-03, 04).
9. Il budget ≤ 5 cifre: il podio di Hall of Fame conta? A 768/1024 il tetto è il misurato? Patrimonio non ci sta
   (MOB-02, 06, 08).

**Una sola spec** — MOB-01: le tolleranze sul fixture, la riga d'ambito nel verdetto (mirror/fixture e «cosa è una cifra»
sono decise, § 9). MOB-02: LA tessera non si chiude mai; +12 px sulle pagine a tab. MOB-03:
«Messo da parte» finora o mese intero. MOB-04: Divisione (paragrafo o didascalia), spesa salvata fuori periodo,
Dividendi e Centri senza striscia, spese avvenute o il trio, Budget «Oltre» dal solo calendario, il «−» di Divisione a
1440. MOB-05: Benchmark in errore, Contributi senza registro. MOB-06: Movimenti in `ErrorNotice` a 1440, le azioni di
Hall of Fame in fondo, la didascalia della barra del Flusso senza importo sul telefono. MOB-07: il vincolo del fondo come riga d'ambito o `binding`, What If (Evento o Prima e dopo),
Obiettivi con o senza striscia. MOB-08: trigger della barra a 44 px, `dense` a 768, sei righe accanto o tutte, iPad
12,9" verticale. MOB-09: il testo delle quattro regole, quali critiche Impeccable, `tile-closed-row` nel frontmatter,
una voce o una per pagina nel draft.
