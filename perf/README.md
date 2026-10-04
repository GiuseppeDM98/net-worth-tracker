# perf/ — il benchmark di velocità e il budget di dimensione

> In repo dal 2026-09-28 (PR #409). Qui: come si lancia, cosa significa ogni
> colonna, la baseline in vigore e il registro dei tetti alzati. La storia (la misura usa-e-getta del 2026-09-26) e le
> spec che useranno questi numeri stanno in `doc/perf/README.md`.

| File | Cosa | Tracciato |
|---|---|---|
| `budget.json` | Il tetto di JS iniziale (gzip, KB) per route e per i chunk condivisi | sì |
| `routes.json` | Le route che il benchmark visita, uguali a `lib/constants/navigation.ts` (`__tests__/perfRoutes.test.ts`) | sì |
| `last-run.json` | Tutte le run e le mediane dell'ultimo `perf:bench` | no |

## Il budget — «quanto JS spedisce ogni route?»

```bash
npm run build && npm run perf:budget                          # legge .next
npm run perf:build && npm run perf:budget -- --dist=.next-perf # la build del benchmark
npm run perf:budget -- --write   # abbassa i tetti alla misura di oggi (+2%); non ne alza mai uno
```

Due secondi, nessun server. Per ogni `server/app/<route>.html` della build somma il gzip dei `<script
src="/_next/static/chunks/…">` e lo confronta con il tetto (`lib/utils/perfBudget.ts`, `compareRoutesToBudget`).
**Esce 1** se una route supera il suo tetto, se una pagina nuova non ha un tetto, se un tetto guarda una pagina che la
build non ha più, o se un tetto è più alto di quello in `HEAD` senza un `raisedBy` nuovo.

| Colonna | Significato |
|---|---|
| chunk | quanti `<script>` iniziali la pagina carica prima di poter disegnare |
| raw KB / gz KB | la loro somma su disco, prima e dopo gzip (1 KB = 1024 byte) |
| testo | caratteri di testo nel `body` dell'HTML prerenderizzato. Fino al 2026-09-28 era 0 su ogni route dashboard (solo lo spinner); da allora ogni route porta la shell — skip link, le voci della sidebar, la bottom nav, l'attesa dell'auth — e conta qualche centinaio. Una route tornata a 0 ha rimesso la shell dietro il cancello (`e2e/shell.boot.spec.ts` legge lo stesso HTML) |
| tetto | `initialJsGzKB` di `budget.json`; `(condivisi)` = i chunk che OGNI route dashboard carica, `sharedGzKB` |

Sotto la tabella, i chunk iniziali più grandi con le route che li usano: è così che si sono viste le copie di recharts
(quattro chunk da 350 KB raw, uno per pagina) e il PDF nel grafo di Storico, fino al 2026-09-30.

**Le copie di una libreria** (`libraryCopies` in `budget.json`, dal 2026-09-30): quante chunk di TUTTA la build — iniziali
e pigri — possono contenere una libreria, riconosciuta da una firma che solo il suo codice scrive
(`LIBRARY_SIGNATURES` in `lib/utils/perfBudget.ts`: per recharts `recharts-wrapper`, il div che ogni suo grafico rende).
`{ "recharts": 1 }`: una seconda copia è ROSSO, e lo è anche una firma che non trova nulla (il controllo non guarderebbe
più niente). È una regola, non una misura: `--write` la ricopia com'è. Visto rosso il 2026-09-30 con una sparkline che
importava `'recharts'` direttamente — e con la firma `recharts-cartesian-grid` di allora rimasto VERDE, perché la
sparkline non usa quel modulo: la firma va presa dal cuore che OGNI uso della libreria si porta dietro.

**Lasciati stare, senza una spec che li prenda** (2026-09-30): il modulo di Firestore resta nel grafo del root
layout, anche su `/login` (con `firebase/auth` 136 KB gz, misura del 2026-09-26) — la LETTURA bloccante davanti alla
shell è già andata (`contexts/AuthContext.tsx`, 2026-09-28), il modulo no, e toglierlo dal login è un lavoro a parte;
`radix-ui` (il pacchetto ombrello), `date-fns/locale` e papaparse (solo Impostazioni › spese, in una tab) non sono
stati verificati nell'analizzatore: il dubbio sul tree-shaking di `radix-ui` resta aperto.

### Il ratchet e il tetto alzato

- Un tetto nasce dalla misura +2%, arrotondato per eccesso (535 → 546), e **si abbassa solo con una misura**
  (`--write`), mai a mano. Una spec che riduce una route abbassa il suo tetto nello stesso commit.
- **Una funzione nuova può alzare un tetto** (proprietario, 2026-09-27): la PR che fa crescere una route oltre il tetto lo
  ALZA a mano nello stesso commit, con `"raisedBy": "#NNN: perché"` sulla route (`sharedRaisedBy` per i condivisi), la
  misura prima/dopo di `perf:budget` e una riga nel registro qui sotto. Un `raisedBy` uguale a quello del rialzo
  precedente non basta: una motivazione vecchia non copre una crescita nuova. Il tetto alzato torna a scendere con la
  prossima spec che riduce, e `--write` allora toglie il `raisedBy`.
- Il tetto precedente è quello di `git show HEAD:perf/budget.json`: il controllo guarda il commit, non l'indice.

### Registro dei tetti alzati

| Data | Route | Da → a (KB gz) | PR | Perché |
|---|---|---|---|---|
| 2026-09-30 | (condivisi) | 470 → 483 | #418 | Il condiviso non sale perché una route è cresciuta: `date-fns`, `date-fns-tz`, `lib/utils/dateHelpers.ts` e `lib/utils/formatters.ts` (54 moduli, ~14 KB) che ogni pagina carica stavano in chunk PER PAGINA, una copia a pagina, e ora stanno nei chunk condivisi (analizzatore Turbopack, prima/dopo: l'insieme dei moduli che ogni pagina carica è lo stesso). Misura 464,6 → 473,5. Patrimonio cresce a parte (+7,4, dentro il suo tetto): recharts è ora UN chunk con i moduli di tutti i grafici |

## Il benchmark — «quanto ci mette l'app a mostrare un numero?»

In tre terminali, con gli emulatori e l'account mirror (dati veri, nessuna scrittura in produzione):

```bash
npm run emulators                              # terminale 1
npm run mirror:seed -- <email di produzione>   # una volta; a fine sessione: npm run mirror:remove
npm run perf:build                             # build di produzione in .next-perf, puntata agli emulatori
npm run perf:serve                             # terminale 2: lo standalone su http://localhost:3200
npm run perf:bench -- --runs=3                 # terminale 3: ~3 minuti su 11 route
```

**Le opzioni vanno SEMPRE dopo `--`**: senza, npm le tiene come `npm_config_*` e lo script non le vede. **E da
PowerShell 5.1 il `--` viene mangiato** (2026-09-28): `npm run perf:budget -- --dist=.next-perf` ha letto in silenzio la
`.next` di due settimane prima — la riga `[perf:budget] build <dir> (BUILD_ID of <data>)` in testa dice quale build sta
leggendo, e da Git Bash i due comandi ricevono le opzioni. `--email=`
(default `mirror@example.com`), `--runs=`, `--routes=assets,history` (nomi di `routes.json`, con o senza
`/dashboard/`, o il nome della pagina), `--warm-only`, `--cold-only`, `--mobile` (390×844 e CPU 4×), `--cpu=N`,
`--revisit` (il secondo caricamento della route dopo una prima visita: la cache persistita, § Revisit). La porta è :3200 perché :3000 è
il server del giro e :3100 quello di Playwright. `perf:serve` cerca `server.js` sotto `.next-perf/standalone/`, perché
Next ci ricopia il percorso del progetto: sul laptop Windows sta in `Documents/GitHub/net-worth-tracker/`.

**Cold** — contesto nuovo, login vero sul form, caricamento completo della route; ms dal `navigationStart`:

| Colonna | Significato |
|---|---|
| auth | Firebase Auth risolto: l'attesa dell'auth — lo skeleton generico che `ProtectedRoute` mostra dentro `main`, etichettato «Verifica dell'accesso» — se ne va, nello stesso commit in cui il nome del profilo compare nel piè della sidebar (dal 2026-09-28; prima era lo spinner). Il marcatore vive in UNA funzione dello script, `isAuthPending`; legge `main` e non la sidebar perché con `--mobile` la sidebar è uno Sheet chiuso, fuori dal DOM |
| h1 | il titolo della pagina è nel DOM |
| primo numero (run 1) | la prima cifra in euro dentro `main`: la mediana, e fra parentesi la prima run — una run 1 molto più lenta è una cache fredda, non una regressione (sotto) |
| LCP · long task · CLS | dal `PerformanceObserver` |
| Firestore · API | richieste del browser a Firestore emulato e alle route `/api/*` (in `last-run.json` con durata e `Server-Timing`) |
| a regime | run che hanno visto titolo e cifra entro 20 s |

**Warm** — un contesto, un login, poi le route una dopo l'altra cliccando i link della shell (la scena di pagina,
aprendo il menu del profilo per Impostazioni); ms dal click: `url` (il pathname è cambiato), `skeleton mostrato` (in
quante run la pagina nuova ha mostrato un'attesa — una cache di React Query non ne mostra), `primo numero` (una cifra in
euro, nessuno skeleton, sulla pagina NUOVA: nulla conta finché il titolo della vecchia è a schermo), long task nel frattempo.

**Letture che sembrano difetti e non lo sono**:
- Firestore emulato risponde in ~1 ms: in produzione ogni round trip vale 50–150 ms, quindi le pagine con più richieste
  in serie sono più lente di quanto la tabella mostri.
- Subito dopo `mirror:seed` la prima run cold di Rendimenti e di FIRE sta intorno ai 10 s: il mirror non copia le cache
  (`performance-cache`, riepiloghi) e l'app le ricalcola alla prima apertura. Una seconda corsa non lo mostra più.
- Allocazione chiama Yahoo solo per un ticker assente o scaduto in `instrument-profile-cache`; il benchmark lo vede come
  tempo della route `/api/portfolio/instrument-profiles`, non come chiamata esterna.
- I TEMPI si confrontano solo sulla stessa macchina, nella stessa sessione (rumore ±10%); i CONTEGGI ovunque.

## Baseline in vigore (cold 2026-09-28 · warm 2026-09-29, laptop Windows, mirror, nessun throttling)

Build di `develop` con #400, #401, #403 e la nuova Esposizione (#407). Mirror: 1539 spese, 45 snapshot, 31 operazioni.

**Cold** (mediane di 3):

| Pagina | primo numero (ms) | LCP | long task | Firestore | API |
|---|---|---|---|---|---|
| Panoramica | 146 | 624 | 89 | 3 | 1 |
| Patrimonio | 680 | 1132 | 193 | 8 | 1 |
| Cashflow | 2191 | 2256 | 372 | 3 | 0 |
| Analisi | 1715 | 1756 | 538 | 3 | 0 |
| Rendimenti | 1093 | 1124 | 158 | 12 | 17 |
| Storico | 2363 | 2380 | 600 | 3 | 0 |
| Hall of Fame | 464 | 476 | 79 | 3 | 0 |
| Allocazione | 548 | 564 | 152 | 3 | 1 |
| FIRE e Simulazioni | 1940 | 1952 | 250 | 8 | 0 |
| Previdenza | 526 | 540 | 79 | 4 | 0 |
| Impostazioni | 470 | 480 | 80 | 3 | 0 |

Auth risolto fra 92 e 227 ms su ogni pagina.

**2026-09-28, la shell prima dell'auth (PR #411), due route rimisurate prima/dopo nella stessa sessione, laptop Windows,
mirror.** Cold, mediane di 3 — Panoramica: auth 102 → 135, primo numero 149 → 178 (run 1: 792 → 570), LCP 580 → 628;
Cashflow: auth 159 → 171, primo numero 1895 → 1775, LCP 1956 → 1820, long task 234 → 176; CLS 0 in entrambe, Firestore e
API invariati. Quello che il marcatore non dice: lo skeleton della shell è nel DOM a 23–31 ms (dall'HTML, prima di ogni
JS) e l'FCP a 80–112 ms — prima, fino ad `auth`, c'era solo lo spinner. `auth` è ora il montaggio della pagina dopo
l'idratazione di un albero più grande: +12/+33 ms, dentro il rumore. «testo» 0 → 265 su ogni route dashboard; nessun
tetto alzato (`/dashboard` 535,0 → 535,7 gz KB, condivisi 459,9 → 461,4).

**Warm** (2026-09-29, build con PERF-05 — PR #413; mediane di 3, ms dal click):

| Pagina | skeleton | primo numero | long task | Firestore | API |
|---|---|---|---|---|---|
| Panoramica | 0/3 | 77 | 0 | 0 | 0 |
| Patrimonio | 0/3 | 100 | 0 | 0 | 0 |
| Cashflow | 3/3 | 1429 | 320 | 4 | 0 |
| Analisi | 0/3 | 188 | 135 | 0 | 0 |
| Rendimenti | 3/3 | 458 | 0 | 12 | 17 |
| Storico | 0/3 | 261 | 190 | 0 | 0 |
| Hall of Fame | 3/3 | 103 | 0 | 2 | 0 |
| Allocazione | 3/3 | 157 | 0 | 2 | 1 |
| FIRE e Simulazioni | 0/3 | 114 | 0 | 0 | 0 |
| Previdenza | 0/3 | 76 | 0 | 0 | 0 |
| Impostazioni | 3/3 | 307 | 0 | 0 | 0 |

**2026-09-29, un solo binario per i dati (PR #413), warm rimisurato prima/dopo nella stessa sessione, laptop Windows,
mirror.** Prima (la stessa build del 2026-09-28 rimisurata quel giorno): Patrimonio 108 · Cashflow 1478 · Analisi 177 ·
Rendimenti 588 (13 Firestore) · Storico 1165 (6) · Hall of Fame 108 · Allocazione 209 (4) · FIRE 1556 (6) · Previdenza 112
· Impostazioni 337 (6). Dopo, la tabella sopra: Storico e FIRE aprono dalla cache senza skeleton (0 letture), Patrimonio,
Analisi, Previdenza e Impostazioni a 0 letture; Cashflow invariato (tutta E, PERF-06); Rendimenti 13 → 12 (gli stadi 2-5
sono PERF-09). Il **cold** NON è stato rimisurato: la tabella cold sopra è quella del 2026-09-28, e FIRE a freddo legge
ora l'intera collezione delle spese (una volta per sessione) invece di due range — doc/guide/fire.md.

**2026-09-30, le spese per finestra (PERF-06, branch `feat/perf-06-spese-per-finestra`), prima/dopo nella stessa
sessione, laptop Windows, mirror (1547 spese: 838 nei 13 mesi di Tracciamento, 675 nel 2026 di Budget, 1299 + 48 nelle
due finestre di FIRE; Analisi resta sull'intera collezione per decisione del proprietario).** Cold, mediane di 5, primo
numero · LCP · long task · Firestore: Cashflow 1898 → **1072** · 1936 → 1132 · 210 → 217 · 3 → 4 (la finestra più i due
documenti dei bordi); FIRE 1737 → **1291** · 1748 → 1304 · 283 → 153 · 3 → 6 (la finestra recente, poi la vecchia
dietro gli snapshot); Analisi 1398 → 1480 (codice invariato: rumore). Revisit, mediane di 3: Cashflow 192 → 164,
Analisi 237 → 206, FIRE 213 → 161, Panoramica 103 → 109. **Warm** (mediane di 3, ms dal click): Cashflow 1429 → 937,
Analisi 188 → **1403**, Storico 261 → 270, FIRE 114 → **1137**, il resto ±: la prima apertura in sessione di Analisi e
FIRE non parte più dalla lista che Cashflow leggeva (Analisi la legge intera da sé, poi Storico e Centri la trovano in
cache; FIRE legge la sua). **Il record persistito dopo un giro** di Tracciamento, Budget, Divisione, FIRE e Storico:
6 chiavi `expenses.*`, 4407 righe, 2,2 MB — una chiave, 1547 righe e 0,8 MB con la sola lista intera — e l'auth
della Panoramica con quel record 165 ms contro ~109 con il record di una route sola (5 caricamenti, mediana). Il
guadagno è a freddo e sulle pagine a finestra; il costo sta nella prima apertura warm delle altre e nel ripristino di
chi gira molte pagine. Nessuna route cresce oltre il tetto (Cashflow 735,4 → 736,8, FIRE 653,7 → 654,7, Analisi 564,6
→ 565,1).

**2026-10-04, Rendimenti legge ogni collezione una volta (PERF-09, branch `perf/09-rendimenti-una-lettura`),
prima/dopo nella stessa sessione, sul MAC del proprietario (i tempi non si confrontano con le tabelle sopra, del laptop
Windows; i conteggi sì), mirror (46 snapshot, 25 asset, 7 dividendi).** Solo `--routes=performance`. Cold, mediane di
5: primo numero 511 → 311 ms, LCP 524 → 328, Firestore 10 → 5, API 17 → 8. Warm, mediane di 5: 424 → 241 ms, Firestore
15 → 8, API 17 → 8, lo skeleton resta (5/5: una prima apertura in sessione legge comunque la cache delle metriche).
Rivisita, mediane di 3: 442 → 90 ms, e la cifra è a schermo allo stesso istante di `auth` — i due payload di Rendimenti
sono nella cache persistita dal 2026-10-04; `skeletonGone − auth` resta 56 ms, non della pagina (il suo skeleton non
compare più, `e2e/performance.degraded.spec.ts`): quale tessera lo tenga non è stato verificato. La route
`POST /api/performance/yields`: 30 ms di mediana (11 chiamate) contro 60 e 67 delle due vecchie (55 ciascuna). Bundle:
Rendimenti 566,3 → 569,2 gz KB (tetto 578), condivisi 473,5 → 475,4 (tetto 483): nessun tetto toccato.

**Bundle** (gz KB, chunk iniziali; il tetto in `budget.json` è +2%) — **dal 2026-09-30, PR #418**: condivisi 473,5
(22 chunk) · landing 452,0 · login 418,2 · Panoramica 538,0 · Patrimonio 731,1 · Cashflow 735,4 · **Analisi 564,6** ·
**Rendimenti 566,3** · **Storico 684,0** · Hall of Fame 541,2 · Allocazione 520,6 · **FIRE 653,7** · Previdenza 592,6 ·
Assistente 659,4 · Impostazioni 623,9; recharts in UN chunk (93,2 gz), iniziale solo su Patrimonio, Storico e FIRE.
Prima (2026-09-28): condivisi 459,9 · Patrimonio 718,2 · Cashflow 729,2 · Analisi 741,4 · Rendimenti 680,2 · Storico
1189,2 (il PDF: un chunk da 513 KB gz) · FIRE 743,5 · le altre ±1.

**Il prefetch dei link della shell** (osservato il 2026-09-30): Next prefetcha la route di ogni link visibile e con il
payload arrivano i chunk client di quella route — a freddo, la finestra di una pagina qualsiasi scaricava ~2057 KB di JS
(tutte le route, le quattro copie di recharts e il PDF compresi), dal 2026-09-30 ~1030. Un chunk raggiunto SOLO da un
`import()` (il PDF, il Sankey sul telefono, le icone, le tab di FIRE) non viene prefetchato; uno nel grafo iniziale di
un'altra route sì. La colonna JS del benchmark lo include: è una traccia, non il budget.

## Revisit — «il secondo caricamento della route» (2026-09-29)

`--revisit` misura il RELOAD di una route già visitata nello stesso contesto: login, prima visita fino a `data`, poi
la seconda `goto`. Dal 2026-09-29 fra le due aspetta che la cache persistita di React Query sia su disco (un record NON
vuoto scritto dopo la prima visita: il persister scrive ~1 s dopo l'ULTIMO evento di cache, e il primo salvataggio, a
mount, è vuoto — una rivisita presa a `data` non ripristinava nulla e misurava l'app di prima); con il persister spento
(`NEXT_PUBLIC_PERSIST_QUERIES=false`) il record non arriva mai e ogni rivisita paga il timeout di 8 s, per questo quella
run dura di più. Lo «skeleton della pagina» non è una colonna della tabella: si legge in `last-run.json` da
`marks.skeletonGone − marks.auth` (0 = dopo l'attesa dell'auth nessun altro skeleton, la pagina è nata con le cifre).

**Prima/dopo nella stessa sessione** (laptop Windows, mirror, 3 run, mediane, ms dal `navigationStart` al primo numero;
«prima» = la stessa build con il persister spento, «dopo» = con il persister; fra parentesi le richieste Firestore):

| Pagina | prima | dopo | skeleton della pagina prima → dopo |
|---|---|---|---|
| Panoramica | 148 (3) | 115 (3) | sì → no |
| Patrimonio | 437 (8) | 144 (4) | sì → no |
| Cashflow | 1208 (4) | 179 (4) | sì → no |
| Analisi | 1150 (3) | 259 (3) | sì → no |
| Rendimenti | 686 (13) | 685 (14) | sì → sì (lo stadio 1 legge con `fetchQuery`: PERF-09 — dal 2026-10-04 nessuno skeleton, sopra) |
| Storico | 1455 (5) | 385 (1) | sì → no |
| Hall of Fame | 235 (3) | 113 (3) | sì → no |
| Allocazione | 344 (4) | 106 (3) | sì → 53 ms (lo skeleton di UNA tessera, l'Esposizione) |
| FIRE e Simulazioni | 1199 (5) | 181 (3) | sì → no |
| Previdenza | 355 (4) | 122 (3) | sì → no |
| Impostazioni | 398 (3) | 348 (3) | sì → sì (il documento delle impostazioni è letto con `staleTime: 0`: PERF-13) |

Quello che la tabella non dice: con il persister l'attesa dell'auth INCLUDE il ripristino (JSON di 0,3–1,5 MB dal
mirror: `auth` 115 → 179 su Cashflow, 161 → 385 su Storico, dove il record ha sei chiavi) — un costo che PERF-06 ha
spostato, non abbassato: la finestra di una route sola è più leggera della lista intera, ma un giro di pagine lascia
nel record una finestra per pagina più la lista intera di Storico (misurato il 2026-09-30, sopra); le richieste Firestore scendono perché le riletture partono in un colpo solo sul
canale già aperto, non perché si legga di meno (ogni ripristino rilegge tutto). La misura precedente della stessa sera,
con la rivisita presa a `data` e senza attesa, dava «dopo» = «prima» su ogni route: è il motivo dell'attesa.

**Due letture scritte il 2026-09-30, rileggendo la misura contro il suo obiettivo** (primo numero sotto 300 ms alla
rivisita). Raggiunto su otto route e **mancato su Storico (385)**, dove quasi tutto il tempo è il ripristino dentro
`auth`; Rendimenti e Impostazioni non erano nell'obiettivo. E la tabella SOTTOSTIMA il ripristino di una sessione vera:
ogni run apre un contesto nuovo per route (`measureCold`), quindi il record che ripristina contiene solo le chiavi di
quella route più l'overview del login, mentre il persister scrive UN record con tutte le chiavi lette nelle ultime 24
ore — chi ha aperto Storico paga poi il suo JSON a ogni caricamento di QUALSIASI route, Panoramica compresa. Le
finestre delle spese (dal 2026-09-30, `lib/utils/expenseWindows.ts`) alleggeriscono il record di chi apre solo Cashflow o
FIRE, non quello di chi apre anche Storico, Analisi o Centri, che leggono tutte le spese per scelta: finché
`expenses.all` è nel record, quel costo resta — e un giro di pagine vi aggiunge una finestra per pagina (sopra, 2026-09-30).
Per misurarlo serve una rivisita presa dopo aver aperto tutte le route nello stesso contesto, che lo script oggi non fa.
