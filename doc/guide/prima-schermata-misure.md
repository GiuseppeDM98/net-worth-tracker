# Le misure della prima schermata (baseline, fixture, registro)

> **When to open this guide** — anyone reading or widening the first-screen budget (`perf/mobile-budget.json`), comparing a census run with what came before, or asking why a cell carries a `raisedBy`. Split from `doc/guide/prima-schermata.md` on 2026-10-17, the day the mobile-composition series closed and its index (`doc/mobile/README.md`, now in `git log -- doc/mobile/`) was retired: that guide is the TOOL (commands, columns, ratchet, fixture), this one is the RECORD (the 2026-09-26 baseline on the mirror, the mirror after the series, the fixture table and the register of every widened entry). The body is in Italian, as the manual it came from.

## Files

| File | Cosa | Tracciato |
|---|---|---|
| `perf/mobile-budget.json` | Il budget per superficie × viewport che `npm run mobile:budget` tiene (fino al 2026-10-17 `doc/mobile/budget.json`: la storia in `git log --follow perf/mobile-budget.json`); ogni voce allargata porta il suo `raisedBy` | sì |
| `.mobile-census/last-run.json` | L'ultima corsa del censimento, da cui si rileggono le celle | no |

Suites to run after a change here: none — a table changes only after a census (`doc/guide/prima-schermata.md` § Files lists the suites of the tool).

## Baseline storica (2026-09-26, mirror, dev server)

### Come è stata misurata

- **Uno script Playwright usa-e-getta** (`doc/mobile/reference/mobile-census.mjs`, oggi in `git log -- doc/mobile/reference/`; Chromium headless, `isMobile` + `hasTouch`,
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
  la differenza fra cifre «nel verdetto» e «fuori» (le ha contate lo script a mano nelle tre pagine dei mock; il censimento
  del 2026-10-10 la rende una misura). I dati grezzi (JSON e screenshot) restano fuori dal repo: portano le cifre reali.

> Presa PRIMA dei contributi del 2026-09-27. Da #401 la riga **Analisi a 390** cambia: sotto i 640 px il Flusso non è più
> un Sankey, `charts` scende da 2 a 1, cifre e controlli salgono, le schermate sono da rimisurare; a 768 e 1024 no. Dal
> 2026-09-28 (la nuova Esposizione, #407) cambiano le righe **Allocazione** (la base dell'Esposizione e la riga di copertura). #400 a interruttore spento
> e #403 non muovono righe. Rimisurate il 2026-10-10 (sotto): il budget nasce con i contributi dentro.

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

**Rimisurate il 2026-10-10 (il primo `mobile:census`, il giorno in cui nasce il budget)**, mirror riseminato quel giorno, build di produzione su :3200, `npm run
mobile:census` — le righe che i contributi del 2026-09-27/28 dovevano muovere (`screens` · tessere sopra la piega /
intere · cifre sopra la piega): **Analisi 390** 4,88 · 1/0 · 13 (#401: il Flusso sotto 640 px è barra e righe);
**Allocazione** 390 5,04 · 2/1 · 26 · 768 3,02 · 2/1 · 48 · 1024 3,86 · 2/1 · 36 (la nuova Esposizione, #407). La
definizione di cifra del censimento, più stretta (ritagli, `[inert]`, opacità 0 e sovrapposizioni `fixed` esclusi), sulla
stessa corsa differisce da quella della baseline di UNA cifra su 57 misure: gli altri scarti dal 26/9 sono dati del mese
(Divisione nello stato «quote non calcolabili», un verdetto con una riga in più); il dettaglio riga per riga stava nelle
note di quella sessione, che non sopravvivono al commit (WORKFLOW.md § Where things are recorded).

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

## Dopo la serie (2026-10-16, mirror, build di produzione)

Lo stesso mirror riseminato il giorno della misura, `npm run mobile:census -- --email=mirror@example.com` sulla build di
`perf:build` servita su :3200 (19 superfici × 3 viewport in 2,7 minuti), con il codice della serie tutto in `develop` (fino al tablet in orizzontale del 2026-10-16). Cella =
`screens` · tessere che iniziano / stanno intere entro `main.clientHeight` · cifre sopra la piega / fuori dal verdetto sopra
la pill — le colonne del fixture (§ Il fixture), non quelle della tabella sopra: la definizione di cifra è quella del censimento (2026-10-10), la misura è sulla
build e non sul dev server, i dati sono quelli di un mese dopo. Solo conteggi, nessun importo.

| Superficie | 390 | 768 | 1024 |
|---|---|---|---|
| Panoramica | 1,77 · 1/1 · 5 / 5 | 1,17 · 8/7 · 5 / 5 | 1 · 8/8 · 12 / 12 |
| Patrimonio | 1,77 · 1/0 · 7 / 4 | 1,15 · 7/7 · 7 / 4 | 1,01 · 7/7 · 10 / 7 |
| Cashflow › Tracciamento | 1,7 · 1/0 · 13 / 7 | 1,2 · 5/3 · 15 / 9 | 1,15 · 5/4 · 16 / 10 |
| Cashflow › Budget | 1,82 · 1/0 · 13 / 8 | 1,3 · 5/5 · 13 / 8 | 1,17 · 5/4 · 15 / 10 |
| Cashflow › Centri | 1,52 · 1/0 · 10 / 7 | 1,11 · 3/3 · 10 / 7 | 1,01 · 3/3 · 10 / 7 |
| Cashflow › Divisione | 1,68 · 1/0 · 17 / 6 | 1,26 · 3/1 · 20 / 12 | 1,2 · 4/3 · 19 / 11 |
| Cashflow › Dividendi | 1,84 · 1/0 · 8 / 5 | 1,32 · 5/3 · 9 / 7 | 1,23 · 6/5 · 9 / 7 |
| Analisi | 1,86 · 1/0 · 8 / 5 | 1,23 · 6/6 · 9 / 5 | 1,14 · 6/6 · 13 / 10 |
| Rendimenti | 1,88 · 1/1 · 5 / 5 | 1,24 · 8/7 · 5 / 5 | 1,08 · 8/8 · 10 / 10 |
| Storico | 1,86 · 1/0 · 10 / 5 | 1,24 · 5/5 · 10 / 6 | 1,23 · 5/5 · 14 / 10 |
| Allocazione | 1,69 · 1/1 · 23 / 20 | 1,09 · 5/5 · 24 / 23 | 1,16 · 5/5 · 25 / 24 |
| Previdenza | 1,8 · 1/0 · 16 / 6 | 1,14 · 5/5 · 16 / 8 | 1,1 · 5/5 · 17 / 9 |
| FIRE › Calcolatore | 1,92 · 1/0 · 12 / 9 | 1,34 · 4/3 · 13 / 10 | 1,3 · 4/3 · 14 / 11 |
| FIRE › Coast | 1,88 · 1/0 · 16 / 12 | 1,22 · 3/3 · 22 / 14 | 1,3 · 3/2 · 19 / 15 |
| FIRE › What If | 2,25 · 1/0 · 15 / 5 | 1,69 · 1/0 · 22 / 11 | 1,82 · 4/3 · 17 / 8 |
| FIRE › Monte Carlo | 1,85 · 1/0 · 5 / 2 | 1,2 · 4/4 · 6 / 3 | 1,12 · 4/3 · 8 / 5 |
| FIRE › Obiettivi (spento sul mirror) | 1 · 1/1 · 0 / 0 | 1 · 1/1 · 0 / 0 | 1 · 1/1 · 0 / 0 |
| Hall of Fame | 1,8 · 1/0 · 19 / 15 | 1,24 · 5/5 · 19 / 17 | 1,22 · 5/4 · 22 / 20 |
| Impostazioni | 2,13 · 2/1 · 5 / 5 | 1,36 · 3/2 · 7 / 7 | 1,56 · 3/2 · 7 / 7 |

Lettura: la mediana delle schermate di scroll passa da 3,8 a **1,82** a 390, da ~2,4 a **1,23** a 768 e da 3,11 a **1,16** a
1024 — il landscape, che la composizione di prima penalizzava, è ora la vista più corta. Le pagine più lunghe di prima
(Patrimonio 5,5 · Allocazione 5,3 · Storico 5,1 · Monte Carlo 5,1 · Rendimenti 4,7) stanno fra 1,69 e 1,88. A 390 nove superfici restano sopra le cinque cifre fuori dal verdetto — letture, classifiche e LA tessera senza curva da
cedere, che il fixture dichiara (§ Il fixture e § Registro delle voci allargate): letture e classifiche restano intere (DESIGN.md → The Lifted-Figure Rule), il «≤ 5» conta ogni cifra, LA tessera compresa, la prima riga chiusa sotto la pill si registra `false` con un `raisedBy` (DESIGN.md → The First-Screen Rule) e dal 2026-10-15 le cifre mosse dalla composizione si registrano come misurate; sul mirror le cifre seguono i dati. Sopra le due
schermate a 390 solo What If (l'Evento è un modulo, LA tessera senza una curva da cedere) e Impostazioni (nessuna composizione).

## Il fixture (`census@example.com`, build di produzione)

**2026-10-10, `census@example.com`, build di produzione su :3200, 19 superfici × 3 viewport in 2,0 minuti; due
corse consecutive identiche.** È il budget (oggi `perf/mobile-budget.json`) com'è nato (`mobile:budget -- --tighten` sulla prima corsa) e
la tabella che ogni rimisura della serie, dal 2026-10-10 al 2026-10-16, ha aggiornato. Cella = `screens` · tessere che iniziano / stanno intere
entro `main.clientHeight` · cifre sopra la piega / cifre fuori dal verdetto sopra la pill · `riga` = `firstClosedRowAbovePill`
dove una riga chiusa esiste (`null` altrove, non stampato); `overflowX` `false` ovunque. **Le colonne 768 e 1024 riscritte dal
`budget.json` del 2026-10-16: il tablet composto — a 1024 LA tessera e la colonna delle righe —, vincolante
da allora: `informational` è vuota, a 768/1024 il misurato è il tetto (DESIGN.md → The First-Screen Rule); il valore di prima sta nella prima cella di
ogni riga.** **La colonna 1024 riscritta di nuovo dal `budget.json` dello stesso giorno (2026-10-16): lo stage in
orizzontale — la risposta a sinistra, l'indice a destra (DESIGN.md → The First-Screen Rule) — e le righe chiuse che rispondono (DESIGN.md → The Closed-Row Rule); il valore
di prima nella prima cella di ogni riga.** **Righe riscritte intere dal
`budget.json` del 2026-10-16 (il `--tighten` del 2026-10-15 aveva stretto Patrimonio 1024 e Budget 768
senza riportarlo qui, e il 2026-10-16 le ha riallargate con `raisedBy`: la deriva fra due macchine)** — la prima riscrittura intera fu dal file del 2026-10-11: il
`--tighten` di quella sessione aveva stretto una ventina di celle senza riportarle qui (le strette sono elencate sotto), e
d'ora in poi ogni rimisura riscrive la tabella intera dal file, non la sola riga toccata. La tabella § Baseline storica (mirror, dev
server, 2026-09-26) non si tocca più.

| Superficie | 390 | 768 | 1024 |
|---|---|---|---|
| Panoramica (2026-10-11, la pagina composta per il telefono: era 3,56 · 1/0 · 15 / 5 · 2,1 · 3/1 · 39 / 23 · 2,75 · 1/0 · 22 / 7; 2026-10-15: 390 `screens` 1,66 → 1,74 sulla macchina di riferimento; 2026-10-16, il tablet composto: 768 era 1,26 · 7/5 · 15 / 15 · riga `true` · 1024 era 1,6 · 1/0 · 10 / 7; 2026-10-16: 390 `screens` 1,74 → 1,75, la testata con i bersagli a 44 px, non riportato qui allora; 2026-10-16, lo stage in orizzontale: 1024 era 1,13 · 7/7 · 5 / 5 · riga `true`) | 1,75 · 1/1 · 5 / 5 · riga `false` | 1,17 · 8/7 · 5 / 5 · riga `true` | 1 · 8/8 · 10 / 10 · riga `true` |
| Patrimonio (2026-10-14, la pagina composta per il telefono: era 3,25 · 1/0 · 16 / 5 · 2,04 · 5/3 · 26 / 15 · 2,67 · 1/1 · 19 / 11; 2026-10-16, il tablet composto: 768 era 1,25 · 5/3 · 16 / 13 · 1024 era 1,58 · 1/0 · 10 / 7; 2026-10-16, lo stage in orizzontale: 1024 era 1,09 · 6/5 · 7 / 4 · riga `true`) | 1,67 · 1/0 · 7 / 4 · riga `false` | 1,15 · 6/6 · 7 / 4 · riga `true` | 1,01 · 6/6 · 11 / 8 · riga `true` |
| Cashflow › Tracciamento (2026-10-12, la pagina composta per il telefono: era 3,16 · 1/0 · 15 / 5 · 2,34 · 3/1 · 23 / 13 · 3,07 · 1/0 · 14 / 5; 2026-10-15: era 1,67 · 12 / 5 · 16 · 14, la deriva del giorno del mese, ogni mese passato del seed ora al giorno 5; 2026-10-16, il tablet composto: 768 era 1,28 · 3/3 · 18 / 10 · 1024 era 1,6 · 1/0 · 16 / 5; 2026-10-16: 390 `screens` 1,69 → 1,7, la testata con i bersagli a 44 px, non riportato qui allora; 2026-10-16, lo stage in orizzontale: 1024 era 1,25 · 5/3 · 13 / 7 · riga `true`) | 1,7 · 1/0 · 13 / 7 · riga `false` | 1,2 · 5/3 · 15 / 9 · riga `false` (sotto la pill: `raisedBy` del 2026-10-16) | 1,15 · 5/4 · 15 / 9 · riga `true` |
| Cashflow › Budget (2026-10-12, la pagina composta per il telefono: era 2,67 · 1/1 · 15 / 9 · 1,9 · 3/1 · 21 / 11 · 2,37 · 1/0 · 15 / 9; 2026-10-16, il tablet composto: 768 era 1,36 · 4/4 · 17 / 11 · riga `true` · 1024 era 1,62 · 1/0 · 17 / 9; 2026-10-16, lo stage in orizzontale: 1024 era 1,29 · 5/4 · 15 / 9 · riga `true`) | 1,83 · 1/0 · 15 / 9 · riga `false` (2026-10-15: 1,81 → 1,83 sulla macchina di riferimento) | 1,3 · 5/5 · 15 / 9 · riga `false` (sul filo della pill: `raisedBy` del 2026-10-16) | 1,17 · 5/4 · 17 / 11 · riga `true` |
| Cashflow › Centri (2026-10-12, la pagina composta per il telefono: era 2,03 · 1/0 · 10 / 5 · 1,47 · 2/1 · 18 / 11 · 1,78 · 1/0 · 10 / 5; 2026-10-16, il tablet composto: 768 era 1,19 · 3/3 · 10 / 5 · riga `true` · 1024 era 1,38 · 1/0 · 10 / 5; 2026-10-16: 390 `screens` 1,55 → 1,56, la testata con i bersagli a 44 px, non riportato qui allora; 2026-10-16, lo stage in orizzontale: 1024 era 1,14 · 3/2 · 10 / 5 · riga `true`) | 1,56 · 1/0 · 10 / 5 · riga `false` | 1,13 · 3/3 · 10 / 5 · riga `true` | 1,04 · 3/2 · 11 / 6 · riga `true` |
| Cashflow › Divisione (2026-10-12, la pagina composta per il telefono: era 2,01 · 1/0 · 22 / 5 · 1,31 · 4/2 · 38 / 18 · 1,61 · 1/0 · 22 / 8; 2026-10-16, il tablet composto: 768 era 1,19 · 4/2 · 19 / 11 · 1024 era 1,5 · 1/0 · 16 / 7; 2026-10-16: 390 `screens` 1,62 → 1,63, la testata con i bersagli a 44 px, non riportato qui allora; 2026-10-16, lo stage in orizzontale: 1024 era 1,26 · 4/3 · 16 / 7 · riga `true`) | 1,63 · 1/0 · 17 / 7 · riga `false` | 1,2 · 4/3 · 19 / 11 · riga `false` (sotto la pill: `raisedBy` del 2026-10-16) | 1,13 · 4/3 · 20 / 11 · riga `true` |
| Cashflow › Dividendi (2026-10-12, la pagina composta per il telefono: era 3,03 · 2/1 · 8 / 4 · 1,92 · 3/1 · 16 / 12 · 2,45 · 3/1 · 7 / 4; 2026-10-16, il tablet composto: 768 era 1,15 · 6/6 · 6 / 4 · riga `true` · 1024 era 1,41 · 1/1 · 6 / 4; 2026-10-16: 390 `tilesFullyAboveFold` 2 → 1, la testata con i bersagli a 44 px, non riportato qui allora; 2026-10-16, lo stage in orizzontale: 1024 era 1,08 · 6/6 · 6 / 4 · riga `true`) | 1,61 · 2/1 · 6 / 4 · riga `false` | 1,16 · 6/6 · 6 / 4 · riga `true` | 1,08 · 6/6 · 8 / 6 · riga `true` |
| Analisi (2026-10-14, la pagina composta per il telefono: era 3,68 · 1/0 · 12 / 7 · 2,43 · 3/1 · 20 / 13 · 3,25 · 1/1 · 12 / 7; 2026-10-16, il tablet composto: 768 era 1,27 · 6/5 · 12 / 9 · riga `true` · 1024 era 1,61 · 1/0 · 12 / 7; 2026-10-16, lo stage in orizzontale: 1024 era 1,24 · 6/4 · 8 / 5 · riga `true`) | 1,86 · 1/0 · 8 / 5 · riga `false` | 1,23 · 6/6 · 9 / 5 · riga `true` | 1,14 · 6/6 · 11 / 8 · riga `true` |
| Rendimenti (2026-10-14, la pagina composta per il telefono: era 4,09 · 1/0 · 8 / 6 · 2,47 · 3/1 · 16 / 11 · 3,25 · 1/0 · 8 / 6; 2026-10-16, il tablet composto: 768 era 1,28 · 5/5 · 7 / 7 · riga `true` · 1024 era 1,62 · 1/0 · 7 / 6; 2026-10-16, lo stage in orizzontale: 1024 era 1,23 · 6/5 · 5 / 5 · riga `true`) | 1,76 · 2/1 · 5 / 5 · riga `false` | 1,16 · 7/7 · 5 / 5 · riga `true` | 1,08 · 7/7 · 10 / 10 · riga `true` |
| Storico (2026-10-14, la pagina composta per il telefono: era 4,71 · 1/0 · 16 / 9 · 3,03 · 3/1 · 29 / 19 · 3,96 · 1/0 · 16 / 10; 2026-10-16, il tablet composto: 768 era 1,31 · 5/5 · 16 / 12 · riga `true` · 1024 era 1,66 · 1/0 · 16 / 10; 2026-10-16, lo stage in orizzontale: 1024 era 1,37 · 5/4 · 12 / 8 · riga `true`) | 1,88 · 1/0 · 12 / 7 · riga `false` (2026-10-15: 1,86 → 1,88 sulla macchina di riferimento) | 1,24 · 5/5 · 12 / 8 · riga `true` | 1,24 · 5/5 · 16 / 12 · riga `true` |
| Allocazione (2026-10-15, la pagina composta per il telefono: era 3,57 · 2/1 · 26 / 18 · 2,33 · 4/2 · 33 / 28 · 2,96 · 2/1 · 28 / 23; 2026-10-16, il tablet composto: 768 era 1,2 · 5/5 · 18 / 17 · riga `true` · 1024 era 1,48 · 2/1 · 18 / 17 · riga `true`; 2026-10-16, lo stage in orizzontale: 1024 era 1,07 · 5/5 · 18 / 16 · riga `true`) | 1,59 · 2/1 · 17 / 16 · riga `false` | 1,07 · 5/5 · 18 / 17 · riga `true` | 1,16 · 5/5 · 19 / 18 · riga `true` |
| Previdenza (2026-10-15, la pagina composta per il telefono: era 3,85 · 1/0 · 12 / 7 · 2,59 · 3/1 · 26 / 12 · 3,37 · 1/0 · 12 / 9; 2026-10-16, il tablet composto: 768 era 1,41 · 1/1 · 11 / 11 · 1024 era 1,75 · 1/0 · 9 / 9; 2026-10-16, lo stage in orizzontale: 1024 era 1,34 · 5/4 · 9 / 9 · riga `true`) | 1,96 · 1/0 · 9 / 9 · riga `false` | 1,22 · 5/5 · 11 / 11 · riga `false` (sotto la pill: `raisedBy` del 2026-10-16) | 1,21 · 5/4 · 14 / 14 · riga `true` |
| FIRE › Calcolatore (2026-10-15, la pagina composta per il telefono: era 3,13 · 1/0 · 16 / 8 · 1,91 · 3/1 · 23 / 12 · 2,45 · 1/0 · 16 / 9; 2026-10-16, il tablet composto: 768 era 1,24 · 4/4 · 18 / 11 · riga `true` · 1024 era 1,54 · 1/0 · 14 / 9; 2026-10-16, lo stage in orizzontale: 1024 era 1,31 · 4/3 · 14 / 11 · riga `true`) | 1,81 · 1/0 · 13 / 10 · riga `false` | 1,22 · 4/4 · 18 / 11 · riga `true` | 1,2 · 4/3 · 15 / 12 · riga `true` |
| FIRE › Coast (2026-10-15, la pagina composta per il telefono: era 2,25 · 1/0 · 16 / 10 · 1,55 · 3/2 · 20 / 12 · 1,95 · 1/0 · 16 / 11; 2026-10-16, il tablet composto: 768 era 1,27 · 3/3 · 22 / 12 · riga `true` · 1024 era 1,59 · 1/0 · 17 / 11; 2026-10-16, lo stage in orizzontale: 1024 era 1,39 · 3/2 · 17 / 13 · riga `true`) | 1,8 · 1/0 · 17 / 12 · riga `false` | 1,21 · 3/3 · 22 / 14 · riga `true` | 1,25 · 3/2 · 18 / 14 · riga `true` |
| FIRE › What If (2026-10-15, la pagina composta per il telefono: era 4,06 · 1/0 · 20 / 5 · 3,03 · 2/1 · 27 / 17 · 4,02 · 1/0 · 20 / 8; 2026-10-16, il tablet composto: 768 era 1,33 · 2/1 · 21 / 13 · 1024 era 1,66 · 1/0 · 14 / 6; 2026-10-16, lo stage in orizzontale: 1024 era 1,34 · 4/3 · 14 / 6 · riga `true`) | 1,73 · 1/0 · 15 / 5 · riga `false` | 1,26 · 3/1 · 21 / 13 · riga `false` (Evento sotto la pill: `raisedBy` del 2026-10-16) | 1,25 · 4/3 · 18 / 8 · riga `true` |
| FIRE › Monte Carlo (2026-10-15, la pagina composta per il telefono: era 4,89 · 1/0 · 6 / 1 · 2,67 · 2/1 · 8 / 3 · 3,47 · 1/0 · 7 / 2; il 4,89 era l'oscillazione del 2026-10-12; 2026-10-16, il tablet composto: 768 era 1,29 · 3/2 · 6 / 3 · 1024 era 1,59 · 1/0 · 6 / 2; 2026-10-16, lo stage in orizzontale: 1024 era 1,22 · 4/3 · 6 / 3 · riga `true`) | 1,83 · 1/0 · 5 / 2 · riga `false` | 1,18 · 4/4 · 6 / 3 · riga `true` | 1,1 · 4/4 · 8 / 5 · riga `true` |
| FIRE › Obiettivi (2026-10-15: acceso nel seed con un obiettivo inventato; era spento, 1 · 1/1 · 0 / 0 ovunque; 2026-10-16, il tablet composto: 768 era 1 · 4/4 · 9 / 0 · riga `true` · 1024 era 1,19 · 4/3 · 9 / 0 · riga `true`; 2026-10-16, lo stage in orizzontale: 1024 era 1 · 4/4 · 9 / 9 · riga `true`) | 1,32 · 4/3 · 9 / 9 · riga `true` | 1 · 4/4 · 9 / 9 · riga `true` | 1,08 · 4/4 · 11 / 11 · riga `true` |
| Hall of Fame (2026-10-10, la pagina composta per il telefono: era 2,88 · 1/0 · 17 / 12 · 1,84 · 3/1 · 34 / 25 · 2,37 · 1/0 · 17 / 12; 2026-10-16, il tablet composto: 768 era 1,3 · 5/4 · 19 / 17 · riga `true` · 1024 era 1,65 · 1/0 · 17 / 15 · riga `false`; 2026-10-16, lo stage in orizzontale: 1024 era 1,31 · 5/4 · 17 / 15 · riga `true`) | 1,8 · 1/0 · 19 / 15 · riga `false` | 1,24 · 5/5 · 19 / 17 · riga `true` | 1,22 · 5/4 · 22 / 20 · riga `true` |
| Impostazioni (2026-10-15: 768 1,36 → 1,38 e 1024 1,69 → 1,71 sulla macchina di riferimento; 2026-10-16, lo stage in orizzontale: 1024 era 1,71 · 3/2 · 4 / 4) | 2,1 · 2/1 · 2 / 2 | 1,38 · 3/2 · 4 / 4 | 1,56 · 3/2 · 4 / 4 |

**Rimisurata il 2026-10-16 nella sessione che ha scritto la composizione in DESIGN.md** (nessun codice toccato; build di produzione su :3200, 2,1 minuti): 335 delle 342
misure identiche a `budget.json`, sette più basse per la deriva del giorno — `screens` di Budget, Storico, Allocazione, Calcolatore e
Coast a 390 e di Impostazioni a 768, e a 390 una tessera intera in più su Allocazione —, non strette (la deriva del giorno non si stringe);
`mobile:budget` verde su 57, rosso con il tetto di Panoramica 390 a 1,74 (misurato 1,75). La tabella sopra resta quella del file.

**Rimisurata il 2026-10-17 alla chiusura della serie** (il codice mergiato di #468, nessun codice dell'app toccato; build di
produzione su :3200, 2,5 minuti, `yahooCalled` falso): `mobile:budget` verde su 57, le stesse sette misure più basse del giorno
prima, non strette.

## Registro delle voci allargate (`raisedBy`)

Una voce di `perf/mobile-budget.json` si allarga solo a mano, con l'OK del proprietario, e porta la ragione nel suo
`raisedBy` («<data>: perché», concatenata alle ragioni che la voce aveva, mai sovrascritta); nello stesso commit una riga
qui, la più recente in cima. Le eccezioni ammesse sono queste e nessun'altra: LA tessera senza una curva da cedere, la cui
prima riga chiusa resta sotto la pill (DESIGN.md → The First-Screen Rule), la pill di `PageTabBar` portata a 44 px
(2026-10-10), la deriva del giorno o della macchina provata sul codice di develop dello stesso giorno.

- **`2026-10-20: allocazione-accumulo`** (prima misura di Allocazione › Accumulo sul fixture, con un piano attivo di 12 rate e nessun portafoglio modello; LA tessera «Questo mese» senza una curva da cedere), due voci: 390 e 768 registrano `firstClosedRowAbovePill: false`, perché l'unica riga chiusa (Classi del piano) sta sotto la pill; 1024 `true`. Misura: 390 1,64 · 1/0 · 10 / 6; 768 1,2 · 2/1 · 13 / 10; 1024 1,27 · 2/1 · 11 / 8.
- **`2026-10-17: …`** (la tessera «Intestatari»; proprietario: la tessera su Panoramica e Patrimonio, a riga intera in coda), due voci a 390
  contro HEAD: `screens` sale su Panoramica 1,75 → 1,83 e su Patrimonio 1,67 → 1,75 — una riga chiusa in più (52 px) in coda alle righe,
  perché il fixture nomina un membro della famiglia tramite il fondo pensione (il suo intestatario È il membro di Previdenza,
  doc/guide/patrimonio.md); il primo schermo non si muove (cifre, tessere e prima riga chiusa come prima), e a 768 e 1024 nessuna voce
  cambia. Corsa: `yahooCalled` false, 2,1 min, le altre 55 voci verdi.
- **`2026-10-16: …`** (lo stage in orizzontale; proprietario: «Allargo con raisedBy»), diciotto voci a 1024 contro HEAD: `figuresAboveFold`
  e `figuresOutsideVerdict` crescono su tutte le superfici con righe — ogni riga chiusa dell'indice stampa la sua risposta (DESIGN.md →
  The Closed-Row Rule) e il censimento la conta come cifra sopra la piega (Panoramica 5 → 10 e 5 → 10, Hall of Fame 17 → 22 e 15 → 20, Previdenza
  9 → 14 e 9 → 14, Rendimenti 5 → 10 e 5 → 10); `screens` sale su Allocazione 1,07 → 1,16 e Obiettivi 1 → 1,08 — LA tessera arriva
  alla piega sotto il verdetto (lo stage in orizzontale) e ciò che segue lo stage parte sotto. La prima riga chiusa sta sopra la piega su
  tutte e diciotto le superfici con righe (Impostazioni non ne ha). Nella stessa riscrittura ogni altra cella a 1024 è stata portata al misurato dove è migliore: `screens` scende
  ovunque tranne Allocazione, Obiettivi e Dividendi (Panoramica 1,13 → 1, Rendimenti 1,23 → 1,08, Impostazioni 1,71 → 1,56 senza la
  barra), e le tessere intere crescono su sette superfici. 390 e 768 non si muovono: le 38 misure identiche al budget di HEAD.

- **`2026-10-16: …`** (il tablet composto; proprietario, interattive), diciotto voci contro HEAD: `figuresOutsideVerdict`
  al misurato dove superava il tetto informativo (a 768/1024 il misurato è il tetto: Coast 768 12 → 14, Obiettivi 768 e 1024 0 → 9, Tracciamento 1024 5 →
  7, Calcolatore 1024 9 → 11, Coast 1024 11 → 13, Monte Carlo 1024 2 → 3); a 768 la prima riga chiusa sotto la pill su cinque
  superfici — Tracciamento +47 px, Budget +8 (il budget aveva `true`), Divisione +50, Previdenza +9, What If +113 (Evento non ha una
  curva) — com'era prima del tablet composto (registrata `false` con `raisedBy`; Patrimonio e Monte Carlo, che lo erano, ora sono sopra); la testata più alta di
  8 px su Panoramica e Cashflow per i bersagli a 44 px: `screens` +0,01 su Panoramica, Tracciamento, Centri e
  Divisione a 390, Divisione e Dividendi a 768, e Dividendi 390 con una tessera intera in meno. Dopo, `--tighten` ha stretto ogni
  cella del tablet migliorata e registrato `true` a 1024 sulle diciotto superfici con righe (Impostazioni non ne ha); cinque celle a 390 che il tablet non tocca (Budget,
  Storico, Allocazione, Calcolatore, Coast) e Impostazioni 768/1024, strette di 0,01–0,04 per la deriva del giorno (le stesse misure
  sulla build di develop della mattina), sono tornate al valore di HEAD (la deriva del giorno non si stringe).

- **`2026-10-16: …`** (la deriva fra due macchine; proprietario: «Allarga le quattro con raisedBy»): quattro celle rosse sulla build
  mergiata delle pagine composte il 2026-10-15 senza una modifica — Patrimonio 1024 `screens` 1,57 → 1,58, Budget 768 1,35 → 1,36, Previdenza 1024 1,74 → 1,75,
  Allocazione 1024 `tilesFullyAboveFold` 2 → 1 — tre corse identiche sulla macchina di riferimento (census in 2,0 min), un giorno dopo
  il `--tighten`; Patrimonio 1024 e Budget 768 erano 1,58 e 1,36 fino al mattino del 2026-10-15 e il `--tighten` del giorno stesso le aveva strette
  senza dichiararle qui. Nello stesso giro Budget 390 1,81, Storico 390 1,86, Impostazioni 768 1,36 e 1024 1,69 leggono 0,02 SOTTO il
  budget stretto il giorno prima (verdi, non strette): la differenza fra le due macchine del 2026-10-15 è una deriva di ±0,01–0,02
  per cella, in entrambi i versi, anche sulla stessa macchina da un giorno all'altro (doc/guide/prima-schermata.md § Per-page blind
  spots). Nel ritiro ogni `raisedBy` che il `--tighten` del 2026-10-15 aveva SOVRASCRITTO torna concatenato alla ragione precedente — dodici
  voci: Panoramica, Budget e Storico 390 riprendono la riga chiusa sotto la pill del 2026-10-11, del 2026-10-12 e del 2026-10-14; Allocazione 390 e
  Previdenza 768 la deriva del 2026-10-11; Calcolatore, Coast e What If 390, Divisione 1024 e Impostazioni 768/1024 la pill del 2026-10-10; Monte
  Carlo 390 l'oscillazione del 2026-10-12 — come si fece il 2026-10-15 su Tracciamento 390: un `raisedBy` tiene ogni ragione che la voce ha portato.
- **`2026-10-16: …`** («Fuori posizione» dice «nulla» solo quando la lettura lo stampa; proprietario: «Allarga con raisedBy»): Allocazione 768 e 1024 `figuresAboveFold`
  17 → 18 e `figuresOutsideVerdict` 16 → 17 — la cella «Fuori posizione» stampa lo 0,0% che la lettura stampa (sul fixture la casa e il
  conto stanno in classi senza target) e dal tablet il KPI resta intero accanto alla striscia; a 390 il KPI è sollevato e nulla si
  muove. Rimisurata sul codice del ritiro: le altre 55 misure identiche alla corsa sulla build mergiata; Monte Carlo 390 `screens` 1,83
  in tre corse sulla stessa build (la metrica che oscillava fra 4,87 e 4,89 prima della composizione non oscilla più).
- **`2026-10-15: …`** (2026-10-15, proprietario in sessione: «Allarga tutte e sei», «registra il misurato»): la
  prima riga chiusa sotto la pill a 390 su Allocazione (Per classe; Bilanciamento non ha una curva da cedere),
  What If (Prima e dopo; Evento è un modulo) e, con la curva già a 120 px, Previdenza (Rendimento), Calcolatore (Base),
  Coast (Afflussi) e Monte Carlo (Distribuzione) — LA tessera senza curva da cedere estesa alle sei, come su Panoramica, Cashflow, Rendimenti, Patrimonio, Analisi e Storico. Le cifre
  fuori dal verdetto a 390: Allocazione 16 (le due celle, i KPI e le dieci della legenda corrente → target, intera: DESIGN.md →
  The Lifted-Figure Rule), Previdenza 9 (le tre celle, l'eroe e le chip), Calcolatore 10 (le due celle, il numero FIRE, il chip e la didascalia),
  Coast 12 (lo stesso più le etichette del grafico; `figuresAboveFold` 16 → 17 a 390, 20 → 22 a 768, 16 → 17 a 1024), Monte
  Carlo 2 (le celle), Obiettivi 9 (le righe della tessera aperta, senza striscia; `screens` 1 → 1,32 e
  `figuresAboveFold` 0 → 9 a ogni larghezza: il fixture ha ora un obiettivo inventato); «≤ 5» non raggiunto su
  Allocazione, Previdenza, Calcolatore, Coast e Obiettivi, dichiarato come Hall of Fame, Budget e Storico. A 768 Previdenza
  passa da 3 a 1 tessere sopra la piega: la striscia di tre celle. `screens` a 390: 1,59 · 1,96 · 1,81 · 1,8 · 1,73 · 1,83
  contro gli obiettivi PER SUPERFICIE della spec del giorno (in `git log -- doc/mobile/`: Allocazione ≤ 1,8, Previdenza ≤ 1,9, Calcolatore ≤ 1,9, Coast ≤ 1,8, What If ≤ 2,2,
  Monte Carlo ≤ 1,8, Obiettivi ≤ 1,8): Previdenza 1,96 e Monte Carlo 1,83 superano il loro e restano registrate come misurate — la spec
  chiedeva che il commit le nominasse e non lo fece; dichiarate nel ritiro del 2026-10-16 (il «≤ 2,5» scritto qui il 2026-10-15 era
  l'obiettivo delle pagine composte il 2026-10-14).
- **`2026-10-15: la macchina di riferimento è cambiata…`** (2026-10-15, proprietario: il budget ha una sola macchina di riferimento): cinque celle `screens` di superfici
  che la composizione del giorno non tocca — Panoramica 390 1,66 → 1,74, Budget 390 1,81 → 1,83, Storico 390 1,86 → 1,88, Divisione 1024 1,47
  → 1,5, Impostazioni 768 1,36 → 1,38 e 1024 1,69 → 1,71 — rosse sulla build di develop PRIMA di ogni modifica della sessione:
  il budget era stato stretto il mattino stesso sull'altra macchina (alla chiusura delle pagine composte il 2026-10-14), e quella di riferimento misura qualche
  centesimo in più.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-15, `--tighten` della sessione): le schermate delle sette
  superfici (Allocazione 3,57 → 1,59, Previdenza 3,85 → 1,96, Calcolatore 3,13 → 1,81, Coast 2,25 → 1,8, What If 4,06 → 1,73,
  Monte Carlo 4,89 → 1,83 a 390) e le cifre dove sono scese (What If 20 → 15 a 390, Monte Carlo 6 → 5); a 768 Allocazione,
  Calcolatore, Coast e Obiettivi registrano la riga chiusa sopra la pill (`true`), Allocazione e Obiettivi anche a 1024;
  Panoramica 768 `tilesAboveFold` 6 → 7 e Budget 768 `riga` `true` sono il misurato della macchina di riferimento.
- **`2026-10-15: deriva del giorno del mese, non del codice…`** (2026-10-15, proprietario): Tracciamento a
  390 (`screens` 1,67 → 1,69, `figuresAboveFold` 12 → 13, `figuresOutsideVerdict` 5 → 7), 768 e 1024 (`figuresAboveFold` 16 → 18 e
  14 → 16). La misura di chiusura del ritiro, il 15 del mese, era rossa lì sola, con valori identici sulla build di develop prima
  delle pagine composte il 2026-10-14 (4dc553c2, due corse): il confronto «sui primi N giorni» del mese scorso prendeva le righe del seed ai giorni 5, 10,
  15 e 20 una alla volta, e dal 15 lo stipendio porta sulla prima schermata le due frecce del trio (la seconda ristampa il ritmo
  del primo enunciato). Il seed mette ora ogni mese passato al 5 (`PAST_DAY`, `scripts/seedCensusE2E.mts`): rimisurato sul codice
  del ritiro, solo queste cinque metriche si muovono, e sono i valori di ogni giorno dal 5 al penultimo. A 390 la voce tiene nello
  stesso `raisedBy` la riga chiusa sotto la pill del 2026-10-12 e la pill del 2026-10-10. L'obiettivo «≤ 5» di Tracciamento non è più
  raggiunto (7: le due frecce si aggiungono a cinque cifre), dichiarato come Budget e Divisione.
- **`2026-10-14: …`** (2026-10-14, proprietario in sessione: «Allarga tutte e cinque»): la prima riga chiusa sotto la pill a 390 su
  Patrimonio (Movimenti finisce a 976 contro 767: verdetto 243 con la cella G/P su una riga sua — «+9183,42 €» supera i 9
  caratteri —, LA tessera 494 con la curva già a 120 px), Analisi (Fuori scala a 1031: verdetto 392 con l'asse 2×2, lo scope e
  «Il perché», il Periodo 392 con le barre a 120 px) e Storico (Composizione a 994: verdetto 260, Evoluzione 495 con la curva a
  120 px e la lettura intera) — LA tessera senza curva da cedere estesa alle tre pagine, come su Panoramica, Cashflow e Rendimenti; e a 1024 `tilesFullyAboveFold`
  1 → 0 su Patrimonio e Analisi (la composizione vale fino a 1439: striscia e «Il perché» spingono LA tessera oltre la piega;
  1024 si compone il 2026-10-16). Le cifre fuori dal verdetto a 390: Patrimonio 4 (le due celle, l'eroe, l'etichetta sinistra della curva:
  Liquidità resta nella striscia, che la cede solo oltre cinque), Analisi 5 con la freccia delle spese sollevata (era 6: la freccia delle spese ristampava il primo
  enunciato), Storico 7 (le due celle, l'eroe, la percentuale dei dodici mesi e le tre cifre della lettura di Evoluzione,
  che resta intera, DESIGN.md → The Lifted-Figure Rule; «≤ 5» non raggiunto, dichiarato). `screens` a 390: 1,67 · 1,86 · 1,86 contro l'obiettivo
  di ≤ 2,5 della spec (il suo testo è in `git log -- doc/mobile/`). Hall of Fame rimisurata, invariata.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-14, `--tighten` della composizione di Patrimonio, Analisi e Storico): ogni altra metrica delle tre
  pagine (le schermate soprattutto: Patrimonio 3,25 → 1,67, Analisi 3,68 → 1,86, Storico 4,71 → 1,86 a 390); a 768 Analisi e
  Storico registrano la riga chiusa sopra la pill (`true`); nient'altro si muove fuori dalle tre pagine.
- **`2026-10-14: la prima riga chiusa (Benchmark) finisce a 891 contro la pill a 767…`** (2026-10-14, proprietario in
  sessione): Rendimenti a 390, `firstClosedRowAbovePill` `false` — il verdetto è alto 267 (titolo, l'asse a 44 px con l'icona del
  calendario, la striscia di due celle, la riga «Base: …» su due righe, «Il perché»), LA tessera 377 con la curva già a 120 px
  e la lettura intera, «Il resto» 44; neanche senza curva la riga starebbe sopra. A 768 la riga sta sopra la pill
  (`true`); a 1024 misura `false` e 7 cifre fuori dal verdetto, informative fino al tablet composto del 2026-10-16 (il budget tiene 6 e `null`, come la
  Panoramica). Le 5 cifre fuori dal verdetto a 390 sono la cella in «%» (quella in punti non conta: una cifra è solo € o %), le tre della
  lettura di «Crescita di 100» e il chip sull'altra base («annualizzato», che il fixture ha: la finestra YTD supera i 6 mesi;
  corretto nel ritiro del 2026-10-14, prima diceva «le due celle»): l'obiettivo
  «≤ 5» è raggiunto; `screens` 1,76 contro il ≤ 2,0 della spec.
- **`2026-10-14: deriva del giorno del mese, non del codice…`** (2026-10-14, proprietario): cinque metriche di Patrimonio
  (390 `screens` 3,23 → 3,25; 768 `figuresAboveFold` 25 → 26; 1024 `screens` 2,64 → 2,67, `figuresAboveFold` 18 → 19,
  `tilesAboveFold` 3 → 1) — la build di develop (83de3f68) misurata lo stesso giorno, PRIMA del codice di Rendimenti composta, dava esattamente
  questi valori, e la corsa dopo li ha ripetuti: le sole righe cambiate fra le due corse sono le tre di Rendimenti.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-14, `--tighten` della composizione di Rendimenti): Patrimonio 390
  `figuresAboveFold` 18 → 16 (la deriva del giorno nell'altro verso, registrata com'è misurata); nient'altro si muove fuori
  da Rendimenti e dalle cinque voci di Patrimonio sopra.
- **`2026-10-12: …`** (2026-10-12, proprietario in sessione: «Allarga tutte e quattro con raisedBy»; le righe chiuse sotto la pill come LA tessera senza curva;
  ogni voce porta anche «la pill a 44 px del 2026-10-10», perché `raisedBy` sta sulla voce superficie × viewport). Le cinque tab di
  Cashflow a 390 registrano `firstClosedRowAbovePill: false`: LA tessera è alta 378–495 px e parte a 340–478, quindi la
  prima riga chiusa inizia a 787 (Dividendi), 940 (Centri), 967 (Budget), 990 (Tracciamento) e 1015 (Divisione) contro la
  pill a 767 — Tracciamento con il grafico già a 120 px e il trio sollevato, Budget con i KPI sollevati e lo storico a barre
  che non ha una curva da accorciare. Quattro allargamenti nuovi: **Budget 390** `tilesFullyAboveFold` 1 → 0 (il Tetto parte a
  404, alto 495, finisce a 899); **Budget 1024** `figuresAboveFold` 15 → 17 (la striscia di due celle si disegna fino a 1439 e
  da 768 i KPI tornano interi); **Divisione 390** `figuresOutsideVerdict` 5 → 7 (le due celle, una per persona, più le cinque
  cifre di In comune: eroe, le due righe del pool, le due categorie — l'obiettivo «≤ 5» non è raggiunto e dichiarato, come
  Hall of Fame e Panoramica); **Dividendi 1024** `tilesAboveFold` 3 → 1 (sotto Incasso netto, 295 → 673, le righe chiuse partono
  a 742 su 768). Il resto delle cinque tab è una stretta: `screens` a 390 da 3,16/2,67/2,03/2,01/3,03 a 1,67/1,81/1,55/1,62/1,61,
  a 768 e 1024 in proporzione; Centri e Dividendi a 768 registrano la riga chiusa sopra la pill (`true`); le cifre sopra la
  piega scendono ovunque salvo Budget 1024 (sopra) — la tabella è riscritta intera dal `budget.json` del 2026-10-12.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-12, `--tighten` della sessione): Monte Carlo 390 `screens`
  4,89 → 4,87 (letta come deriva del giorno); nient'altro si muove fuori da Cashflow.
- **`2026-10-12: screens oscilla fra 4,87 e 4,89 a parità di codice…`** (2026-10-12, nel ritiro, proprietario): Monte Carlo 390
  `screens` riportato a 4,89 — la misura di chiusura del ritiro leggeva 4,89 tre volte sul codice corretto, e sulla build di
  develop (e450d00e, uno `stash`) due corse consecutive hanno letto 4,87 e poi 4,89: non il giorno né il codice, la metrica
  oscilla fra due valori (~17 px, una riga che va a capo o no) sulla stessa pagina; la composizione di Monte Carlo l'ha rimisurata
  il 2026-10-15 (1,83) e il 2026-10-16 l'ha letta 1,83 in tre corse sulla stessa build: composta, non oscilla più
  (doc/guide/prima-schermata.md § Per-page blind spots tiene la lezione del 2026-10-12).

- **`2026-10-10: pill a 44 px`** (2026-10-10, la pill di `PageTabBar` è un bersaglio di 44×44): `screens` di ogni superficie a tab, alle tre viewport — le cinque di
  Cashflow, Calcolatore, Coast, What If e Monte Carlo di FIRE, Impostazioni (30 voci; Obiettivi, una schermata, non si
  muove): +0,01/0,02 schermate ciascuna — salvo Divisione 1024, che la stessa corsa ha stretto (1,62 → 1,61) e che porta
  comunque l'etichetta, perché `raisedBy` sta sulla voce superficie × viewport e non sulla metrica (scelto alla chiusura del 2026-10-10) —,
  la pill da ~40 a 52 px. I valori sono il misurato esatto.
- **`2026-10-10: la striscia (3 cifre) e il podio a cinque righe sopra la pill, la prima riga chiusa sotto la pill con il grafico
  già a 120 px`** (2026-10-10): Hall of Fame a 390 (`figuresAboveFold` 17 → 19,
  `figuresOutsideVerdict` 12 → 15, `firstClosedRowAbovePill` `false`) e a 1024 (`figuresOutsideVerdict` 12 → 15,
  `firstClosedRowAbovePill` `false`). Il perché, misurato sul fixture a 390: la pill inizia a 767 px; il verdetto (titolo,
  prima frase, 3 celle, «Il perché») è alto 214 e LA tessera, aperta con il grafico a 120 px e il podio a cinque righe
  (doc/guide/hall-of-fame.md § Composizione mobile), 553 — la prima riga chiusa inizia a 943, e anche senza grafico (−170 px) resterebbe sotto; le 15 cifre
  fuori dal verdetto sono le 3 celle, le 2 della lettura e le 10 del podio, che restano intere (DESIGN.md → The Lifted-Figure Rule). A 768 la riga
  chiusa sta sopra la pill (`true`, registrato da `--tighten`). L'obiettivo «≤ 5 a 390» resta non raggiunto per questa
  pagina, e dichiarato: il 2026-10-14 la rimisura (invariata), il 2026-10-17 scrive la regola (DESIGN.md → The First-Screen Rule).
- **`2026-10-11: la prima riga chiusa (Sintesi) finisce a 879 contro la pill a 767…`** (2026-10-11, la Panoramica composta): Panoramica a 390,
  `firstClosedRowAbovePill` `false` — la striscia prende due righe (103 px: «+3000,00 €» è una cella larga, oltre i 9 caratteri una riga sua, come
  ogni variazione a quattro cifre) e LA tessera (442 px: eroe 66, la riga «Andamento» con la pill a 44 px 74, la curva già a
  120, le etichette 15, il conteggio 48) chiude a 757; «Il resto» 44, Sintesi 825 → 879. A 768 la riga sta sopra la pill
  (`true`). Le 5 cifre fuori dal verdetto a 390 sono le 3 celle, l'eroe e l'etichetta sinistra della curva: l'obiettivo «≤ 5»
  è raggiunto; `screens` 1,66 contro l'1,6 stimato dalla spec del giorno (in `git log -- doc/mobile/`; la striscia su due righe, non stimata).
- **`2026-10-11: la curva di PatrimonioTile a 120 px sotto desktop…`** (2026-10-11): Patrimonio `figuresAboveFold` 12 → 18 a 390 e
  22 → 25 a 768 — la curva più corta porta sopra la piega le etichette, il digest e il conteggio; `screens` scende (3,34 →
  3,23 · 2,1 → 2,04 · 2,73 → 2,64). È il cambio che la composizione di Patrimonio (2026-10-14) usa con gli stessi nomi.
- **`2026-10-11: deriva del giorno del mese, non del codice…`** (2026-10-11): sei voci (sette metriche) di Storico (390 `figuresAboveFold` 15 → 16,
  768 28 → 29), Allocazione (390 25 → 26 e cifre fuori 17 → 18, 1024 27 → 28) e Previdenza (768 24 → 26, 1024 `screens` 3,36
  → 3,37) — il codice di develop (1629613) misurato lo stesso giorno (uno `stash`, una build, il census sulle quattro
  superfici) dà esattamente questi valori, e anche Patrimonio a 390 dava 14 prima della curva: il fixture non è invariante al
  giorno come assume con le sue date relative al giorno della corsa (doc/guide/prima-schermata.md § Per-page blind spots; la prova N / N+1 chiesta il 2026-10-11, non fatta nemmeno il 2026-10-16, resta aperta).
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-11, `--tighten` della sessione): `screens` di una ventina di
  celle di altre superfici scende di 0,01–0,11 (Budget 390 2,73 → 2,67, Storico 390 4,82 → 4,71, Allocazione 390 3,63 →
  3,57, …) — la deriva del giorno nell'altro verso, registrata com'è misurata; nessuna cifra fuori dal verdetto si muove
  salvo quelle con `raisedBy` sopra.
- **Strette nello stesso commit, senza un `raisedBy` nuovo** (2026-10-10, `--tighten`; Divisione 1024 è una voce a tab e tiene quello della pill): dieci celle di altre superfici scendono
  di uno o due punti (Allocazione 390 `screens` 3,65 → 3,63, Divisione 390 cifre fuori 6 → 5, Coast 390 11 → 10,
  Tracciamento 768 cifre 24 → 23, Calcolatore 768 25 → 23, Divisione 1024 1,62 → 1,61 e 23 → 22, Dividendi 1024 5 → 4,
  What If 1024 10 → 8) perché l'unità di una cifra è ora uno span proprio in `NarrativeSegments` (una cella di
  monospazio in meno per cifra: qualche frase in una riga in meno). Il contatore del census riconosce la coppia
  cifra+unità solo in quello span (`[data-figure-unit]`): senza quel vincolo contava anche i KPI che stampano valore e
  unità divisi, che la baseline non ha mai contato — 25 cifre invece di 20 su Analisi a 768 con le tessere ferme
  (doc/guide/prima-schermata.md).

## Per-page blind spots

- **La tabella del fixture è il budget, non la misura di un giorno**: le celle sono i valori di `perf/mobile-budget.json`, e una corsa che legge qualche centesimo più in basso resta verde senza stringere (la deriva del giorno e della macchina, `doc/guide/prima-schermata.md` § Per-page blind spots).
