# Composizione mobile — analisi, misure e specifiche

> Sessione del 2026-09-26, dalla domanda del proprietario: «l'app è densa di informazioni in ogni sua parte, ed è
> questo che le va contro sul telefono: lì guardo al massimo 4–5 informazioni». Questa cartella tiene UNA specifica per
> implementazione (`MOB-NN-*.md`, sullo stesso template delle 14 spec PERF, tutte ritirate entro il 2026-10-08, ognuna con il prompt e il modello in coda), il censimento
> di riferimento in `reference/`, il prompt che ritira una spec dopo il suo merge in `develop` (`ritiro.md`) e questo indice: la domanda con la risposta, come è stato misurato il mobile attuale,
> la baseline, le tre direzioni disegnate e quella scelta, l'ordine consigliato e lo stato. **Si implementa DOPO le 14
> spec PERF** (decisione del proprietario; tutte in develop e ritirate, l'ultima il 2026-10-08): PERF-02 (in develop dal 2026-09-29) e PERF-03 (in develop dal 2026-09-30: la riga «Aggiornato alle…» sta nel `PageHeader`, non nella composizione) cambiano la shell che il mobile eredita, PERF-04 (in develop dal 2026-09-30), PERF-12 (dal 2026-10-06) e PERF-11 (dal 2026-10-07) e PERF-14 (dal 2026-10-08)
> hanno toccato gli stessi componenti. Una spec che si chiude aggiorna la tabella in § 6 e, se ha rimisurato, la tabella § 3.1
> «Fixture» (creata da MOB-01 con la prima corsa sul fixture del budget); la tabella del 2026-09-26 sul mirror (§ 3) resta
> intatta come riferimento storico, e le corse sul mirror di fine spec vanno in SESSION_NOTES (solo aggregati). **Lettura
> adversariale del 2026-10-10**: tutte e nove le spec rilette insieme contro il codice e le decisioni di § 9, 261 rilievi
> corretti in loco e 49 domande chiuse (§ 9, decisioni 9–57); § 10 è vuoto. MOB-01 è fatta (2026-10-10): § 3.1 ha
> la prima tabella del fixture.

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
- **Cosa NON misura**: i tempi (dev server, non build di produzione: la baseline dei tempi è doc/guide/velocita.md § Baseline in vigore, quella storica del 2026-09-26 in § Baseline storica);
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

**Rimisurate il 2026-10-10 (MOB-01)**, mirror riseminato quel giorno, build di produzione su :3200, `npm run
mobile:census` — le righe che i contributi del 2026-09-27/28 dovevano muovere (`screens` · tessere sopra la piega /
intere · cifre sopra la piega): **Analisi 390** 4,88 · 1/0 · 13 (#401: il Flusso sotto 640 px è barra e righe);
**Allocazione** 390 5,04 · 2/1 · 26 · 768 3,02 · 2/1 · 48 · 1024 3,86 · 2/1 · 36 (la nuova Esposizione, #407). La
definizione di cifra di MOB-01, più stretta (ritagli, `[inert]`, opacità 0 e sovrapposizioni `fixed` esclusi), sulla
stessa corsa differisce da quella della baseline di UNA cifra su 57 misure: gli altri scarti dal 26/9 sono dati del mese
(Divisione nello stato «quote non calcolabili», un verdetto con una riga in più) e sono in SESSION_NOTES di quel giorno.

### 3.1 Fixture (dal primo `mobile:census` di MOB-01)

**2026-10-10, `census@example.com`, build di produzione su :3200 (Mac), 19 superfici × 3 viewport in 2,0 minuti; due
corse consecutive identiche.** È `doc/mobile/budget.json` com'è nato (`mobile:budget -- --tighten` sulla prima corsa) e
la tabella che le spec MOB-02..08 aggiornano quando rimisurano. Cella = `screens` · tessere che iniziano / stanno intere
entro `main.clientHeight` · cifre sopra la piega / cifre fuori dal verdetto sopra la pill. `firstClosedRowAbovePill` è
`null` ovunque (nessuna riga chiusa prima di MOB-02), `overflowX` `false` ovunque. La tabella § 3 (mirror, dev server,
2026-09-26) non si tocca più.

| Superficie | 390 | 768 | 1024 |
|---|---|---|---|
| Panoramica | 3,56 · 1/0 · 15 / 5 | 2,1 · 3/1 · 39 / 23 | 2,75 · 1/0 · 22 / 7 |
| Patrimonio | 3,34 · 1/0 · 12 / 5 | 2,1 · 5/3 · 22 / 15 | 2,73 · 1/0 · 18 / 11 |
| Cashflow › Tracciamento | 3,15 · 1/0 · 15 / 5 | 2,33 · 3/1 · 24 / 13 | 3,06 · 1/0 · 14 / 5 |
| Cashflow › Budget | 2,72 · 1/0 · 15 / 9 | 1,88 · 3/1 · 21 / 11 | 2,35 · 1/0 · 15 / 9 |
| Cashflow › Centri | 2,04 · 1/0 · 10 / 5 | 1,46 · 2/1 · 18 / 11 | 1,76 · 1/0 · 10 / 5 |
| Cashflow › Divisione | 2,02 · 1/0 · 22 / 6 | 1,3 · 4/2 · 38 / 18 | 1,62 · 1/0 · 23 / 8 |
| Cashflow › Dividendi | 3,03 · 2/1 · 8 / 4 | 1,92 · 3/1 · 16 / 12 | 2,44 · 3/1 · 7 / 5 |
| Analisi | 3,72 · 1/0 · 12 / 7 | 2,44 · 3/1 · 20 / 13 | 3,25 · 1/1 · 12 / 7 |
| Rendimenti | 4,11 · 1/0 · 8 / 6 | 2,47 · 3/1 · 16 / 11 | 3,25 · 1/0 · 8 / 6 |
| Storico | 4,82 · 1/0 · 15 / 9 | 3,05 · 3/1 · 28 / 19 | 3,98 · 1/0 · 16 / 10 |
| Allocazione | 3,65 · 2/1 · 25 / 17 | 2,36 · 4/2 · 33 / 28 | 2,99 · 2/1 · 27 / 23 |
| Previdenza | 3,9 · 1/0 · 12 / 7 | 2,62 · 3/1 · 24 / 12 | 3,36 · 1/0 · 12 / 9 |
| FIRE › Calcolatore | 3,18 · 1/0 · 16 / 8 | 1,93 · 3/1 · 25 / 12 | 2,44 · 1/0 · 16 / 9 |
| FIRE › Coast | 2,3 · 1/0 · 16 / 11 | 1,53 · 3/2 · 20 / 12 | 1,93 · 1/0 · 16 / 11 |
| FIRE › What If | 4,08 · 1/0 · 20 / 5 | 3,02 · 2/1 · 27 / 17 | 4,04 · 1/0 · 20 / 10 |
| FIRE › Monte Carlo | 4,89 · 1/0 · 6 / 1 | 2,69 · 2/1 · 8 / 3 | 3,48 · 1/0 · 7 / 2 |
| FIRE › Obiettivi (spento) | 1 · 1/1 · 0 / 0 | 1 · 1/1 · 0 / 0 | 1 · 1/1 · 0 / 0 |
| Hall of Fame | 2,88 · 1/0 · 17 / 12 | 1,84 · 3/1 · 34 / 25 | 2,37 · 1/0 · 17 / 12 |
| Impostazioni | 2,09 · 2/1 · 2 / 2 | 1,36 · 3/2 · 4 / 4 | 1,7 · 3/2 · 4 / 4 |

**Voci allargate con `raisedBy`** (decisioni 19 e 22): nessuna.

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
| Costo | `PageVerdict`, `Tile`, `PageHeader`, `PageTabBar` | + `DiaryRow`, un endpoint aggregato (contro le spec PERF), una regola «una cifra per pagina» | + un `TilePager` con cinque regole proprie |
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
DOPO quei contributi.

MOB-01 va prima di tutto, come PERF-01: le altre si chiudono con i suoi numeri. MOB-02 è il CONTRATTO che sette spec
citano alla lettera (la tabella delle API in § 4.1); le due decisioni di fondazione che poneva — l'ordine del DOM e la
posizione dell'asse — sono decise in § 9 (1, 2, 11, 12). **Le spec si implementano UNA PER VOLTA, nell'ordine dei
numeri, 01 → 09, mai due insieme** (proprietario, 2026-10-10, decisione 9): ogni spec parte dal diff di quella prima,
e un modulo condiviso appartiene alla spec con il numero più basso che lo tocca — chi viene dopo lo usa con quei nomi.
MOB-08 (tablet) vuole le pagine composte; MOB-09 chiude la serie: finché manca, DESIGN.md dice il contrario del codice.

| Modulo condiviso | Proprietaria | Chi lo usa dopo |
|---|---|---|
| `doc/mobile/budget.json`, `scripts/mobileCensus.mjs`, `lib/utils/mobileBudget.ts`, il fixture `census@example.com` (`scripts/seedCensusE2E.mts`) | MOB-01 | tutte |
| `PageVerdict` (`strip`, `scope`, `axis`, `restCollapse`), `Tile` (`collapse`, `asideWhenClosed`, `LIFTED_FIGURE_CLASS`), `ErrorNotice` (`collapse`, `live`), `VerdictStrip`, `PageRest`, `verdictStrip.ts`, `mobileSections.ts`, i due hook, `--ease-spring`, `PageTabBar` | MOB-02 | MOB-03..08 |
| `PatrimonioTile` (`liftedFigures`, `id`, curva a 120 px), `ComposizioneTile` di overview (`collapse`, `asideWhenClosed`), `salesNarrative.ts` (`binding`), `describeScheduledCaption` | MOB-03 | MOB-06 (Patrimonio), la landing |
| `scheduledSentence` come `scope` (`describeTrackingScope`), `CashflowKpiTrio` e `CashflowPeriodoTile.liftedFigures`, `ExpenseDialog.onSuccess(saved)`, `components/cashflow/CashflowTabSkeletons.tsx`, `e2e/bundle.lazy.mobile.spec.ts` e `e2e/lazyTabLanding.ts` | MOB-04 | MOB-06 (Analisi), MOB-08 |
| `playwright.config.ts`: il progetto `degraded-mobile` e `/degraded\./` nel `testIgnore` di `mobile` | MOB-05 | MOB-08 |
| `analisi/tiles/PeriodoTile.liftedFigures`, `FlussoTile.liftedFigures` | MOB-06 | MOB-08 |
| `usePortfolioExposure(ownerId, assets, options)` | MOB-07 | — |
| `playwright.config.ts`: i progetti `tablet` e `tablet-landscape`; `lib/utils/tabletComposition.ts`; la barra di `app/dashboard/layout.tsx` | MOB-08 | MOB-09 |
| DESIGN.md, `.impeccable/design.json`, `## Composizione mobile` uniformata nelle guide, README.md utente, PRODUCT.md | MOB-09 | — |

Ogni spec riscrive anche le stesse righe (CLAUDE.md «Latest» e § Current Status, § 6 e § 3.1 di questo indice,
`Draft Release Temp.md`, `doc/guide/e2e-emulatori.md`): in sequenza non c'è conflitto, e ognuna le riscrive nello stato
finale della serie fino a lei.

**Cosa è cambiato dopo le spec (2026-10-10, fuori dossier, in develop)** — chi apre MOB-04 e MOB-06 riverifica contro il codice:
Patrimonio ha un tipo di asset in più, il **prestito** (`loan`, valore negativo, `doc/guide/patrimonio.md`): la tessera
«Mutuo» è ora UNA PER PRESTITO (eyebrow «Mutuo» o «Prestito», MOB-06 § 4.1 `-mutuo-<loanId>`), un prestito personale
è una riga «debito» della Liquidità, il conteggio dell'hero dice «18 strumenti, 4 conti e 1 prestito»
(`formatHoldingCounts(held, accounts, loans)`), e la prima apertura migra da sola il debito dell'immobile. Il form
spesa (MOB-04 § 4) ha il campo «Commissione» su OGNI riga e su ogni voce di una serie, la spunta «Estinzione
anticipata» su una rata «Debiti», e un trasferimento può atterrare su un immobile («Destinazione» raggruppata Conti /
Immobili); le righe citate di `ExpenseDialog.tsx` sono quindi spostate. Il BTP Valore Insieme (cedola unica a
scadenza) non tocca la composizione. Nessuna striscia e nessun budget cambia per questo: le cifre nuove sono dentro
le tessere che già c'erano. **Visto da MOB-01 (2026-10-10, fixture a 390)**: nella fila KPI di Tetto del mese
(`TettoTile`) a tetto superato «~11.274 €» e «840 €» si sovrappongono — una cella senza `min-w-0`/contenitore per un
importo largo; MOB-04, che ricompone il Budget, lo corregge e lo asserisce.

Un avvertimento del passaggio di coerenza, da tenere davanti: **il budget della prima schermata rischia di diventare
una lista di eccezioni** — le clausole vincolanti annullano il taglio del verdetto, le tessere eroe sono alte 585–709 px.
Per questo si misura sul fixture `census@example.com` (decisioni 6 e 10), con tolleranza zero (23), e le sole eccezioni
ammesse sono le voci con `raisedBy` (19, 22), elencate in § 3.1. Le domande comuni sono state risposte una volta (§ 9),
non spec per spec.

## 6. Stato

| Spec | Titolo | Priorità | Sforzo | Dipende da | Modello · effort | Stato |
|---|---|---|---|---|---|---|
| [MOB-01](MOB-01-censimento-e-budget-prima-schermata.md) | Il censimento in repo e il budget della prima schermata | 1 | M | — (PERF-01 e PERF-00 in develop) | Opus 5.5 · high | fatta il 2026-10-10 (`mobile:census`, `mobile:budget`, il fixture `census@example.com`, § 3.1); due decisioni nuove in § 9 (58, 59) |
| [MOB-02](MOB-02-primitive-della-composizione.md) | Le primitive della composizione | 1 | L | MOB-01 | Fable 5.1 · xhigh | da fare · riletta in modo adversariale il 2026-10-10: 30 rilievi, 11 decisioni |
| [MOB-03](MOB-03-panoramica.md) | Panoramica | 2 | M | MOB-01, MOB-02 | Fable 5.1 · high | da fare · riletta in modo adversariale il 2026-10-10: 28 rilievi, 6 decisioni |
| [MOB-04](MOB-04-cashflow-cinque-tab.md) | Cashflow: le cinque tab | 2 | L | MOB-01, MOB-02, MOB-03 | Fable 5.1 · xhigh | da fare · riletta in modo adversariale il 2026-10-10: 34 rilievi, 9 decisioni |
| [MOB-05](MOB-05-rendimenti.md) | Rendimenti | 2 | M | MOB-01, MOB-02 | Fable 5.1 · high | da fare · riletta in modo adversariale il 2026-10-10: 25 rilievi, 4 decisioni |
| [MOB-06](MOB-06-patrimonio-analisi-storico-hall-of-fame.md) | Patrimonio · Analisi · Storico · Hall of Fame | 3 | L | MOB-01, MOB-02, MOB-03, MOB-04 | Opus 5.5 · high | da fare · riletta in modo adversariale il 2026-10-10: 35 rilievi, 8 decisioni |
| [MOB-07](MOB-07-allocazione-previdenza-fire.md) | Allocazione · Previdenza · FIRE | 3 | L | MOB-01, MOB-02 | Fable 5.1 · high | da fare · riletta in modo adversariale il 2026-10-10: 27 rilievi, 7 decisioni |
| [MOB-08](MOB-08-tablet-768-e-1024.md) | Tablet: 768 e 1024 | 3 | M | MOB-02..07 | Opus 5.5 · high | da fare · riletta in modo adversariale il 2026-10-10: 30 rilievi, 5 decisioni |
| [MOB-09](MOB-09-design-md-guide-e-chiusura.md) | DESIGN.md, guide e chiusura | 3 | M | MOB-02..08 | Opus 5.5 · high | da fare · riletta in modo adversariale il 2026-10-10: 27 rilievi, 6 decisioni |

Le PERF citate nelle intestazioni delle spec sono tutte ritirate e in develop: non sono dipendenze aperte. L'ordine è quello
dei numeri (decisione 9).

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

`npm run mobile:census -- --email=census@example.com` e poi `npm run mobile:budget`, sulla build di produzione di
`perf:build` servita da `perf:serve` (:3200), con gli emulatori accesi, il `--` di npm davanti alle opzioni e da Git Bash
su Windows (PowerShell 5.1 mangia il `--`). Il censimento risemina il fixture, ricostruisce i suoi record di Hall of
Fame e si rifiuta dal 1 al 4 del mese e l'ultimo giorno; l'uscita (`.mobile-census/`: JSON senza testi e screenshot)
è gitignored. Il mirror (`--email=mirror@example.com`) serve al giro guidato e al confronto con la baseline § 3 in
SESSION_NOTES, mai al budget. Comandi, colonne e ratchet: doc/guide/prima-schermata.md.
`--selftest` prova la misura su un frammento noto, senza server. `reference/mobile-census.mjs` resta come lo script che
ha misurato la baseline.

## 9. Decisioni del proprietario (2026-09-26)

- Sì al design ad hoc, come **composizione mobile** (stesse tessere, token, narrative, route): cambia la prima
  schermata (verdetto + ≤ 5 cifre fuori dal verdetto, al più 4 nella striscia) e come si arriva al resto (un tap).
- **Una sola composizione «schermo piccolo»** per telefono e tablet: due colonne dai 768, al più tre a 1024; `desktop:`
  resta l'unico switch, `lg:` resta vietato.
- **Direzione A** come base; da C l'eyebrow rosso e Plusvalenze in errore; niente diario, niente pager.
- **Il verdetto sul telefono = titolo + prima frase**, il resto dietro «Il perché»; una clausola che cambia il senso di
  una cifra (tasse su una vendita, base misurata, calendario) resta sempre visibile.
- **Una tessera sul telefono non ripete** ciò che striscia o verdetto hanno stampato; torna intera dal tablet.
- **Le sezioni aperte si ricordano per pagina** (`localStorage`, per dispositivo).
- Prima le 14 spec PERF (tutte ritirate entro il 2026-10-08), poi queste.
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
- **Decisioni della lettura adversariale (2026-10-10)**, numerate di seguito alle otto di fondazione; ogni spec le cita
  per numero. Le prime sedici sono trasversali, le altre stanno sotto la spec a cui appartengono.
  - **Trasversali.** (9) **Una spec per volta, nell'ordine dei numeri 01 → 09**, mai due insieme; un modulo condiviso è
    della spec con il numero più basso che lo tocca (tabella in § 5). (10) **Il budget si misura sull'account dedicato
    `census@example.com`** (`npm run e2e:seed:census`, `scripts/seedCensusE2E.mts`: Centri e Divisione accesi, una cedola,
    una riga in calendario, la storia di Hall of Fame del seed `hof`, date relative al giorno della corsa così che ogni
    superficie mostri gli stessi conteggi in qualunque giorno del mese); `mobile:census` lo risemina prima di misurare
    quando `--email` è il suo. (11) **L'ordine unico è il DOM di oggi su ogni pagina**: a 1440 non cambia nulla salvo LA
    tessera portata in testa dove non lo è (What If); sul telefono le righe chiuse seguono il DOM desktop (Panoramica:
    Sintesi prima di Cashflow); nessuna classe `order-*` nelle griglie composte; ogni guida dichiara l'ordine in
    § Composizione mobile. (12) **L'asse sta subito sotto il titolo, prima della prima frase** (titolo → asse → prima
    frase → striscia → scope → «Il perché»); **a 1440 sono due istanze dello stesso controllo** (nello slot con
    `desktop:hidden`, al posto di oggi con `hidden desktop:flex`, stessa prop di stato, come le `actions` di
    `PageHeader`). (13) **Le cifre dello `scope` contano DENTRO il verdetto** (ogni discendente della `section` salvo
    l'`ul` della striscia); `PageVerdict` rende lo `scope` a ogni larghezza quando la pagina lo passa (sotto `desktop:`
    dopo la striscia, a 1440 sotto il paragrafo), e la pagina che lo vuole solo sotto `desktop:` lo passa con
    `sections.compact`. (14) **La didascalia del calendario sotto le cifre che lo contengono compare a ogni larghezza**
    (Panoramica, Tracciamento); **in Analisi e Divisione `scheduledSentence` esce dalla `sentence` e diventa lo
    `scope`**, `lead` = la prima frase, nessun `binding` su `scheduledSentence`; in Divisione «Con quelle, …» diventa
    «Con le spese in calendario, …». (15) **Una cella della striscia può ripetere una cifra che la tessera aperta stampa
    nella sua LETTURA, in una riga di classifica o in una riga del ledger**: The Lifted-Figure Rule nasconde solo i
    BLOCCHI (KPI, chip, didascalie, eroi); letture, classifiche e ledger restano interi. (16) **Il conto «≤ 5 cifre fuori
    dal verdetto sopra la pill» conta tutte le cifre, LA tessera compresa**; l'obiettivo 5 vale a 390; a 768/1024
    l'obiettivo è il misurato di MOB-08, che fa da tetto. (17) **Di un blocco sollevato si nasconde solo la cifra
    ripetuta**, l'altra resta nella tessera («€ da spostare», `trailingPct`, la quota del trio); **quando la cifra non
    ripetuta farebbe sforare il 5, il blocco si nasconde intero e la cifra entra come clausola nel seguito di «Il
    perché»** (l'euro del chip dell'anno su Panoramica e Patrimonio, il chip «dal massimo» di Rendimenti). (18) **Per la
    deroga «solo titolo» conta ogni cella della striscia**, anche `points`, `pp`, `ratio` e `rank` (la decisione 7 vale
    solo per il censimento): Rendimenti con il 60/40 va in «solo titolo», senza si taglia al primo «;». (19) **LA tessera
    senza curva** (Bilanciamento, Evento, Tetto del mese, Obiettivi, e Hall of Fame se il grafico a 120 px non basta):
    `firstClosedRowAbovePill` registrato `false` con `raisedBy: "MOB-NN: perché"` in `budget.json` e una riga in § 3.1,
    solo per le superfici elencate. (20) **Lo zero firmato si stampa senza segno ovunque** («0 €», `isPrintedZero`):
    `formatStripFigure` lo fa, MOB-03 e MOB-06 allineano `overviewNarrative` e `patrimonioNarrative` (cambio a 1440
    dichiarato). (21) **LA tessera resta sempre aperta**, fuori dal controller, senza trigger. (22) **La pill di
    `PageTabBar` passa a 44×44**; le pagine a tab crescono di ~12 px e `budget.json` si allarga per le sole metriche
    mosse con `raisedBy: "MOB-02: pill a 44 px"`. (23) **Tolleranza zero** su ogni metrica; `mobile:budget -- --tighten`
    scrive il misurato esatto, solo con `--email=census@example.com`, e si rifiuta se una superficie è `missing` o
    `unsettled`. (24) **L'eroe di LA tessera è esente dalla regola «non ripete»** anche quando il `lead` lo nomina (è la
    tessera).
  - **MOB-02.** (25) Le due azioni di Hall of Fame («Aggiungi una nota», «Aggiorna i record») scendono dopo il
    Dettaglio sotto `desktop:` già in MOB-02; il grafico di Record del patrimonio scende a 120 px; se la prima riga chiusa
    resta sotto la pill, eccezione `raisedBy` (19). Il podio resta a cinque righe.
  - **MOB-03.** (26) «Messo da parte finora» = la quota del verdetto (`resolveLivedCashflow`), già arrotondata con
    `Math.round` come la frase; la tessera Cashflow tiene il mese intero. (27) Mese con `taxIsTheStory`: il taglio va DOPO
    la clausola della vendita (titolo + prima frase + tasse visibili, risparmio e mercato dietro «Il perché»). (28) Una
    cella con un valore oltre 9 caratteri («+123.456,78 €») prende una riga intera della striscia e le altre scendono
    (layout di `VerdictStrip`, MOB-02).
  - **MOB-04.** (29) Una spesa salvata dal «+» fuori dal periodo o dai filtri: nessuna apertura, periodo e filtri fermi,
    solo il toast di successo che esiste. (30) Dividendi e Centri di Costo senza striscia. (31) La striscia di
    Tracciamento solleva il trio (totali del periodo, calendario compreso, con lo `scope` «Nel totale ci sono ancora…»);
    nel trio si nascondono solo le tre cifre ripetute. (32) Il residuo per persona di Divisione passa al «−» U+2212 anche a
    1440. (33) Budget oltre il tetto: frase intera e striscia (la ripetizione è nel verdetto, non nella tessera).
    (34) Tetto superato solo dal calendario: la cella si chiama «Supererai» e apre `bud-rischio`; «Oltre» (superamento
    già avvenuto) apre `bud-avvisi`. (35) In attesa e in errore il wrapper del verdetto resta montato e rende lo slot
    `axis` attorno a skeleton ed `ErrorNotice`: il selettore è lo stesso elemento e tiene il focus (ingegneria, non una
    scelta).
  - **MOB-05.** (36) Benchmark con tutte e sei le serie fallite = lettura fallita a ogni larghezza (`SectionSpec.failed`,
    `ErrorNotice` al posto della tessera, cella 2 «modello non disponibile»). (37) Contributi senza registro: punto cieco
    dichiarato in `doc/guide/rendimenti.md`. (38) Il chip «dal massimo del periodo» passa nel seguito sotto `desktop:`
    (caso di 17); il chip sull'altra base resta.
  - **MOB-06.** (39) Storico: una sola cella del Driver, «Risparmio {anno}»; il mercato resta nel ledger aperto.
    (40) Patrimonio: eroe esente (24); `'yearly'` e `'curve-end'` sollevati come MOB-03, l'euro dell'anno nel seguito (17);
    striscia G/P + Liquidità; se il census conta più di 5, cede la cella Liquidità. (41) Movimenti in lettura fallita:
    `ErrorNotice` anche a 1440. (42) Le didascalie della barra del Flusso («Quote delle spese», «Quote di quanto è
    uscito») perdono l'importo sotto `desktop:` quando ristampa una cifra del verdetto o della striscia; lo tengono con un
    disavanzo (base diversa dalle entrate).
  - **MOB-07.** (43) What If: LA tessera è Evento, prima nel DOM anche a 1440 (cella sinistra); MOB-09 riscrive la frase
    desktop di The Input Tile Rule. (44) Il vincolo del fondo è la riga d'ambito `scope` sotto `desktop:`
    (`describeFireLockScope`), la frase nel seguito. (45) Allocazione: «Fuori posizione» + lo scarto maggiore, il
    punteggio no. (46) Previdenza con due o più contribuenti: verdetto intero e nessuna striscia; con uno, `leadLength: 0`
    e le tre celle. (47) Obiettivi: nessuna striscia.
  - **MOB-08.** (48) Il trigger della barra in orizzontale a 44×44 (`size-11` + `py-1`, barra 53 px, prima schermata 715).
    (49) A 1024 al più 6 righe chiuse accanto a LA tessera (`MAX_BESIDE_ROWS = 6`), le altre sotto su tre colonne; accanto
    stanno solo le chiuse che precedono la prima aperta, da lei in poi tutto va sotto in ordine DOM (da 1); flusso
    `sparse`, mai `dense` (da 1). (50) iPad 12,9" in verticale (contenitore 992 px): tre colonne con la pill; lo skeleton
    generico resta a due colonne. (51) Il criterio «`screens` a 1024 ≤ `screens` a 768» è sostituito da «`screens` a 1024
    ≤ la baseline del 2026-09-26 a 1024 (§ 3)» per ogni superficie composta, misurato da `mobile:budget` sul fixture.
  - **MOB-01 (2026-10-10, nella sessione di implementazione).** (58) **I record di Hall of Fame del fixture li costruisce
    il server**: `mobile:census` chiama `POST /api/hall-of-fame/recalculate` dopo il seed (un seed Admin non può
    importare i builder, che portano dentro l'SDK client). (59) **Il fixture non si misura dal 1 al 4 del mese né
    l'ultimo giorno** (ora italiana): le righe del mese stanno al 5 e il Budget non prevede prima del giorno 4;
    l'ultimo giorno la riga in calendario scade. `mobile:census` esce 1 con il perché.
  - **MOB-09.** (52) Il testo delle quattro regole lo applica Claude verbatim in DESIGN.md e nel sidecar, dopo l'OK del
    proprietario sul testo nella sessione MOB-09. (53) Critiche Impeccable: nuove per Panoramica, Tracciamento,
    Rendimenti e Hall of Fame; le altre dodici cancellate nello stesso commit, rifatte da `polish` in sessioni successive.
    (54) `components.tile-closed-row` entra nel frontmatter di DESIGN.md (i colori di `tile-default`, `rounded:
    "{rounded.2xl}"`, `height: "52px"`, `padding: "0 20px"`). (55) Nel Draft una voce per pagina, riscritta nello stato
    finale, più una di 📚 Documentation. (56) Il giro F di MOB-09 si fa con DevTools sul portatile a 390 e 1024 sul
    mirror (l'app degli emulatori si collega a 127.0.0.1: un telefono non entra); la riga in errore con uno script
    Playwright usa-e-getta. (57) Le critiche si scrivono dal Mac (WORKFLOW § Where things are recorded).

## 10. Domande aperte al proprietario

Nessuna: le 49 domande della lettura adversariale del 2026-10-10 sono chiuse in § 9 (decisioni 9–57), le due della
sessione MOB-01 sono le decisioni 58 e 59, e ogni spec
scrive la sua risposta come istruzione. Una domanda nuova nasce solo da un fatto che una sessione di implementazione
scopre nel codice, si pone subito al proprietario con lo strumento interattivo e la risposta si aggiunge qui.
