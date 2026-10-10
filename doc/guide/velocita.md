# Velocità e dimensione (budget, benchmark, census)

> **When to open this guide** — anyone touching `perf/budget.json`, `perf/routes.json`, the four scripts `scripts/perf{Budget.mts,Benchmark.mjs,Serve.mjs,RenderCensus.mjs}` or `lib/utils/perfBudget.ts`, a PR that makes a route grow past its ceiling, or anyone who has to say whether a change made the app faster or heavier. The tooling is in repo since 2026-09-28 (PR #409); this manual lived in `perf/README.md` until 2026-10-08, when the last of the fourteen PERF specs of 2026-09-26 was retired and their dossier (`doc/perf/`) with it — the measure they all started from is § Baseline storica below. `AGENTS.md` keeps the stub (`AGENTS.md § Performance tooling`, `AGENTS.md § Commands`); here is the full rule: how each tool is run, what every column means, the baseline in force, the before/after of every speed session and the register of raised ceilings (the body is in Italian, as the manual was written). The environment — the production build on :3200, the emulators, the mirror — is SETUP.md → Step 6-7 and WORKFLOW.md § 3. The first-screen census, which runs on the same build and port but measures composition rather than time, has its own guide since 2026-10-10: `doc/guide/prima-schermata.md`.

## Files

| File | Cosa | Tracciato |
|---|---|---|
| `scripts/perfBudget.mts` · `lib/utils/perfBudget.ts` (la metà pura, tenuta da `__tests__/perfBudget.test.ts`) | `npm run perf:budget` | sì |
| `scripts/perfBenchmark.mjs` · `scripts/perfServe.mjs` | `npm run perf:bench` · `npm run perf:serve` (la build di `npm run perf:build`, in `.next-perf`) | sì |
| `scripts/perfRenderCensus.mjs` | `npm run perf:census` | sì |
| `budget.json` | Il tetto di JS iniziale (gzip, KB) per route e per i chunk condivisi | sì |
| `routes.json` | Le route che il benchmark visita, uguali a `lib/constants/navigation.ts` (`__tests__/perfRoutes.test.ts`) | sì |
| `last-run.json` | Tutte le run e le mediane dell'ultimo `perf:bench` | no |
| `last-census.json` | Tutte le run e le mediane dell'ultimo `perf:census` | no |

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
| 2026-10-08 | (condivisi) e quattordici route (tutte tranne Assistente) | condivisi 483 → 534 · / 469 → 511 · Panoramica 569 → 608 · Allocazione 553 → 593 · Analisi 611 → 648 · Patrimonio 669 → 699 · Cashflow 732 → 763 · FIRE 698 → 736 · Hall of Fame 574 → 615 · Storico 735 → 772 · Previdenza 631 → 661 · Rendimenti 612 → 651 · Impostazioni 670 → 701 · login 424 → 474 · register 424 → 475 | #436 | **Una dipendenza, non una funzione**: `firebase` 12.13 → 12.19 (`@firebase/firestore` 4.14.1 → 4.17.2, +5% unpacked; auth e app invariati) porta +57 KB gz nel chunk vendor che ogni pagina carica (135,6 → 192,2), e `next` 16.2.12 → 16.4.0 ne toglie 16 (→ 190,7). Misurato a parità dell'altra: condivisi 482,8 → 539,5 con Next 16.2 + firebase 12.19, → 523,5 con Next 16.4. **Non si può restare a 12.13**: `firebase-admin` 14 vuole `@firebase/app` 0.16.2, che solo firebase ≥ 12.19 porta — con ogni versione inferiore `npm ls @firebase/app` ne mostra due e la build muore su «Component auth has not been registered yet» (provato su 12.13, 12.16, 12.18). Il tetto è la misura +2%; l'Assistente resta sotto il suo (680,8 su 700) |
| 2026-10-05 | dodici route (tutte tranne Cashflow, login e register) | / 458 → 469 · Panoramica 546 → 569 · Allocazione 527 → 553 · Analisi 576 → 611 · Patrimonio 733 → 780 · Assistente 670 → 700 · FIRE 667 → 698 · Hall of Fame 545 → 574 · Storico 698 → 735 · Previdenza 601 → 631 · Rendimenti 578 → 612 · Impostazioni 625 → 670 | #432 | Il React Compiler acceso: ogni componente porta la sua memo cache, +20–26% gz sul codice dei componenti (stimato file per file e confermato dalla build). Misura senza / con il compiler, stessa sessione, Mac: condivisi 475,5 → 482,8 (dentro il tetto) · / 452,4 → 459,4 · Panoramica 538,3 → 557,0 · Allocazione 520,5 → 542,0 · Analisi 565,6 → 598,2 · Patrimonio 731,7 → 764,7 · Assistente 660,7 → 686,1 · FIRE 655,3 → 683,7 · Hall of Fame 541,3 → 562,5 · Storico 684,9 → 720,0 · Previdenza 593,5 → 618,0 · Rendimenti 569,4 → 599,5 · Impostazioni 624,3 → 656,7. **Cashflow SCENDE** 736,2 → 717,3 (tetto 744 → 732): con il compiler cresceva a 832,5 e il primo numero a freddo da 616 a 730 ms, quindi le quattro tab non di default sono diventate `lazyComponent` nella stessa spec. I tempi non regrediscono: A/B ravvicinato, 7 run, Cashflow 593 / 593 ms, long task 0 / 0; Analisi (controllo) 920 / 951 |
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

**2026-10-05, le route server leggono una volta (PERF-10, branch `perf/10-route-server-una-lettura`), prima/dopo
nella stessa sessione, sul Mac, mirror (7 dividendi, 25 asset, 6 conversazioni).** `--routes=allocation,cashflow`,
mediane di 5: Allocazione cold 222 → 194 ms, warm 218 → 216; Cashflow cold 620 → 598, warm 519 → 531 — nessun file
client di queste due pagine toccato: rumore. Il benchmark di Cashflow NON chiama `/api/dividends/stats`: la tab
Dividendi non è quella di default e `routes.json` non porta query, quindi la misura di Dividendi è la route, 20
chiamate dirette due volte: **25/22 → 12/11 ms** di mediana, `Server-Timing` `db` ~8–10 · `compute` ~1 · `total`
~10–13 (dividendi letti 4 → 1 volta, sette letture in serie → un `Promise.all` di quattro). La route dei profili ora
porta `Server-Timing` (`auth, db, yahoo, total, hits, fetched, source`): nel benchmark `source=cache`, `hits=12`,
`fetched=0`, `total` 14–24 ms, zero chiamate a Yahoo a regime. Bundle: Assistente 660,6 gz KB (tetto 670), le altre
invariate; nessun tetto toccato. **`npm run perf:budget` senza `--dist=.next-perf` legge `.next`**: sul Mac era una
build del 15/08, ROSSA su cinque route e su recharts — la riga `[perf:budget] build …` in testa lo dice.
**Lo stesso giorno, ritirando la spec**: la tab Dividendi apre con UNA richiesta invece di due (la lista viaggia nella
risposta di `/api/dividends/stats`; `/api/dividends` non è più chiamata all'apertura) e la collezione dei dividendi è
letta una volta per apertura invece di due — contato in richieste da `e2e/cashflow.dividendi.spec.ts` (visto rosso a
due) e in letture da `__tests__/dividendStatsRoute.test.ts`; nessun tempo misurato. La route del contesto
dell'assistente non rilegge memoria e impostazioni quando la pagina le manda la preferenza (due documenti in meno, in
serie prima del builder; tenuto da `__tests__/assistantRoutes.test.ts`).

**2026-10-07, Patrimonio a righe leggere (PR #434, branch `perf/11-patrimonio-righe-leggere`), prima/dopo nella
stessa sessione, laptop Windows, mirror (25 asset, 18 strumenti), mediane di 5.** Solo Patrimonio. Cold a 1440: primo
numero 521 → 443 ms, LCP 956 → 852, long task 73 → 54. Cold a 390 con CPU 4× (`--mobile`): primo numero 2001 → 1466 ms,
LCP 2508 → 1712, long task 1327 → 754. Grafici montati a 390: 15 → 0 (1 dopo l'apertura di una riga); righe di
Strumenti nel DOM 36 → 18 a ogni larghezza. Bundle: Patrimonio 764,7 → 655,8 gz KB, recharts fuori dal suo grafo
iniziale (tetto 780 → 669, `raisedBy` tolto). Il census per tasto è in § Il census. Trascritto il giorno stesso,
ritirando la spec: la chiusura l'aveva scritto solo nell'indice del dossier e in CLAUDE.md.

**Bundle dal 2026-10-08 (PR #436, Next 16.4 + firebase 12.19 + firebase-admin 14)**: condivisi 523,5 (22 chunk) ·
landing 500,8 · login 464,7 · register 465,1 · Panoramica 595,4 · Patrimonio 685,1 · Cashflow 747,2 · Analisi 634,8 ·
Rendimenti 637,3 · Storico 756,7 · Hall of Fame 602,2 · Allocazione 580,6 · FIRE 720,6 · Previdenza 647,4 · Assistente
680,8 · Impostazioni 686,9 — +38…43 per route, tutto nel chunk vendor (il registro sopra dice di chi). Prima, il 2026-10-07
(PR #434): condivisi 482,8 · landing 459,4 · login 422,1 · Panoramica 557,1 · Patrimonio 655,8 · Cashflow 717,6 · Analisi
598,3 · Rendimenti 599,5 · Storico 720,0 · Hall of Fame 562,5 · Allocazione 542,0 · FIRE 683,7 · Previdenza 618,0 ·
Assistente 686,1 · Impostazioni 656,7.

**Bundle** (gz KB, chunk iniziali; il tetto in `budget.json` è +2%) — **dal 2026-09-30, PR #418**: condivisi 473,5
(22 chunk) · landing 452,0 · login 418,2 · Panoramica 538,0 · Patrimonio 731,1 · Cashflow 735,4 · **Analisi 564,6** ·
**Rendimenti 566,3** · **Storico 684,0** · Hall of Fame 541,2 · Allocazione 520,6 · **FIRE 653,7** · Previdenza 592,6 ·
Assistente 659,4 · Impostazioni 623,9; recharts in UN chunk (93,2 gz), iniziale solo su Patrimonio, Storico e FIRE — su Patrimonio non più dal 2026-10-07
(PR #434, sopra).
Prima (2026-09-28): condivisi 459,9 · Patrimonio 718,2 · Cashflow 729,2 · Analisi 741,4 · Rendimenti 680,2 · Storico
1189,2 (il PDF: un chunk da 513 KB gz) · FIRE 743,5 · le altre ±1.

**Il prefetch dei link della shell** (osservato il 2026-09-30): Next prefetcha la route di ogni link visibile e con il
payload arrivano i chunk client di quella route — a freddo, la finestra di una pagina qualsiasi scaricava ~2057 KB di JS
(tutte le route, le quattro copie di recharts e il PDF compresi), dal 2026-09-30 ~1030. Un chunk raggiunto SOLO da un
`import()` (il PDF, il Sankey sul telefono, le icone, le tab di FIRE) non viene prefetchato; uno nel grafo iniziale di
un'altra route sì. La colonna JS del benchmark lo include: è una traccia, non il budget.

## Baseline storica (2026-09-26, laptop Windows, mirror, nessun throttling CPU)

La misura usa-e-getta da cui sono partite le quattordici spec PERF (dossier `doc/perf/`, 2026-09-26 → 2026-10-08), presa su
`develop` PRIMA dei contributi del 2026-09-27 (#400, #401, #403) e della nuova Esposizione (PERF-00, #407), con uno script
Playwright usa-e-getta poi diventato `scripts/perfBenchmark.mjs`: 3 run cold, 2 warm, mediane; i grezzi restano in git
(`git show d8d3d98:doc/perf/reference/baseline-2026-09-26-cold.log`, e `…-warm.json`). Superata il 2026-09-28 dalla
baseline in vigore sopra; resta come «prima» di tutto il lavoro. I «46 caratteri di testo» dell'HTML erano il `<title>`:
il `body` ne aveva 0.

**Le tre domande di partenza, con le risposte.** Firebase non è il limite: con Firestore emulato (round trip ~1 ms)
Cashflow impiegava 2,1 s a mostrare un numero, Storico 2,3 s, Analisi 1,7 s — CPU del browser (deserializzare 1533
documenti, ridurli, montare la pagina) e catena d'avvio (HTML vuoto → JS → Firebase Auth → query); in produzione ogni
round trip vale 50–150 ms, quindi contano i round trip IN SERIE (Rendimenti ne faceva 4–5 con 17 chiamate API; la
Panoramica ricalcolava il riepilogo in sei stadi sequenziali con le funzioni Vercel a Washington). Non serviva migrare
(AGENTS.md § React Query and Derived State): le due leve lato Firebase erano la regione delle funzioni e i riassunti
materializzati per pagina. Lato codice stava quasi tutto: la shell che non esisteva finché Auth non risolveva, la cache
che moriva al reload, 460 KB gz di JS su ogni pagina con recharts quattro volte e il PDF nel grafo di Storico, le stesse
collezioni lette con meccanismi diversi, le spese intere per mostrare un mese, N grafici montati al buio su Patrimonio,
il React Compiler mai acceso e 70 stati in un componente, il lavoro di layout e colori a ogni mount.

**Cold** — reload della route dopo il login (ms; mediane di 3):

| Pagina | primo numero | LCP | long task | Firestore | API | note |
|---|---|---|---|---|---|---|
| Panoramica | 150 | 680 | 93 | 3 | 1 | un payload materializzato |
| Patrimonio | 790 | 1230 | 270 | 8 | 1 | N sparkline montate; waterfall mutuo e ledger |
| Cashflow › Tracciamento | 2110 | 2200 | 400 | 3 | 0 | tutta E (1533 doc) |
| Analisi | 1690 | 1710 | 565 | 3 | 0 | tutta E |
| Rendimenti | 1110 (1000–2070) | 1140 | 144–377 | 10–14 | 17 | 5 collezioni lette due volte + 10 route yield |
| Storico | 2285 | 2300 | 670 | 3 | 0 | tutta E; PDF nel bundle |
| Allocazione | 590 | 610 | 165 | 4 | 1 | Esposizione → Yahoo ogni volta |
| Previdenza | 584 | 600 | 96 | 4 | 0 | il modello: tutto su React Query |
| FIRE | 2040 | 2050 | 300 | 7–8 | 0–1 | catena a 3 |
| Hall of Fame | 510 | 530 | 88 | 3 | 0 | un documento |
| Impostazioni | 527 | 548 | 93 | 5 | 0 | 71 `useState` |

Lo spinner di `ProtectedRoute` (Firebase Auth) se ne andava fra 86 e 228 ms dal `navigationStart`.

**Warm** — navigazione client dalla sidebar, stessa sessione (ms dal click; mediane di 2):

| Pagina | skeleton mostrato | primo numero | long task | Firestore | API |
|---|---|---|---|---|---|
| Panoramica | no | 141 | 0 | 5 | 0 |
| Patrimonio | sì | 314 | 83 | 11 | 0 |
| Cashflow | sì | 1226 | 124 | 4 | 0 |
| Analisi (spese già in cache) | **no** | **242** | 153 | 2 | 0 |
| Rendimenti | sì | 574 | 0 | 13 | 17 |
| Storico | sì | 1250 | 255 | 8 | 0 |
| Allocazione | sì | 606 | 55 | 4 | 1 |
| Previdenza | sì | 131 | 0 | 2 | 0 |
| FIRE | sì | 1757 | 75 | 6 | 0 |
| Hall of Fame | sì | 127 | 0 | 2 | 0 |

Analisi con le spese già in cache (242 ms, nessuno skeleton) contro Analisi a freddo (1690 ms): la stessa pagina, con lo
stesso dato già in memoria, sette volte più veloce — la misura che ha giustificato la cache persistita e un solo binario
per i dati (doc/guide/cache-persistita.md, AGENTS.md § React Query and Derived State).

**Bundle** (gzip, chunk iniziali per route): condivisi da ogni pagina 460 KB (21 chunk; 136 KB firebase, 69 react-dom, 43
framer-motion) · login 415 · Panoramica 535 · Patrimonio 717 · Cashflow 726 · Analisi 734 · Rendimenti 681 · **Storico
1192** · Allocazione 510 · Previdenza 589 · FIRE 743 · Hall of Fame 534 · Impostazioni 610 · Assistente 657; recharts in
QUATTRO chunk da 350 KB raw (uno per pagina); lucide-react intero (575 KB raw / 143 KB gz) alla prima icona di
categoria; 93 chunk su disco, 9,0 MB raw.

## Il census — «quanta pagina ri-renderizza UN tasto?» (2026-10-05)

`scripts/perfRenderCensus.mjs`, sulla stessa build e la stessa porta del benchmark, ma con il profiling di React:

```bash
npm run perf:build -- --profile                     # next build --profile: React di profiling, i tempi nei fiber
npm run perf:serve                                  # :3200
npm run perf:census -- --runs=5 --label=prima       # ~2 minuti; --scenario=settings,expense,tabs,asset · --mobile
npm run perf:census -- --scenario=mount,nav --route=history,fire-simulations,dashboard   # un caricamento, un cambio di pagina
```

Cinque scenari, ognuno in un contesto nuovo con il login vero, nulla salvato: **settings** (10 tasti in «Anno inizio
storico cashflow» di Impostazioni › Preferenze, un input controllato della pagina), **allocation** (dal 2026-10-08,
PR #439: 10 tasti in «Target Criptovalute» di Impostazioni › Allocazione, la tab più grande — Crypto perché la formula
non la possiede mai, quindi il campo è abilitato su ogni account), **expense** (10 tasti in «Importo» di
«Nuova Spesa» › Spesa variabile, letto da `useWatch` alla radice del dialog), **tabs** (Cashflow Tracciamento ⇄ Budget,
quattro cambi con entrambe le tab già montate), **asset** (dal 2026-10-07, PR #434: 10 tasti in «Quantità» di
«Aggiungi asset» › ETF, la posizione iniziale — non «Modifica»: un ETF è un tipo del registro, e in modifica quantità e
PMC sono in sola lettura). Dal 2026-10-08 (PR #441) due scenari che non digitano: **mount** (un caricamento pieno della
route di `--route=`, una o più separate da virgole, default `history`: la registrazione si accende con un init script
PRIMA della navigazione e si ferma a «dati a schermo» — `main h1`, una cifra in euro, nessuno skeleton — più 1 s; il
login è già atterrato sulla Panoramica e le sue letture hanno 2 s per entrare nella cache persistita, quindi ogni run
parte dallo stesso record) e **nav** (Hall of Fame ⇄ Previdenza dai link della sidebar, quattro cambi, ognuno atteso
fino alla pagina nuova senza skeleton + 800 ms). **I contatori CDP sono del DOCUMENTO**: ripartono da zero a una
navigazione piena (LayoutCount 5 → 2 su un reload, misurato), quindi `mount` legge il documento nuovo da zero. Il JSON
porta anche `byName` intero per run: un host che deve renderizzare una volta invece di due si legge per nome (build
`--no-mangling`). Le colonne sono PER TASTO (per cambio, in `tabs` e `nav`; per caricamento, in `mount`):

| Colonna | Significato |
|---|---|
| commitsPerUnit | commit di React |
| renderedPerUnit | componenti la cui funzione è stata ESEGUITA in quei commit: un finto hook delle DevTools (`__REACT_DEVTOOLS_GLOBAL_HOOK__`, iniettato prima del bundle) percorre l'albero a ogni commit come le DevTools — un sottoalbero condiviso col commit prima non è stato visitato, un fiber visitato ha girato solo se porta il flag `PerformedWork`. Funziona anche su una build senza `--profile` |
| renderMsPerUnit | `actualDuration` della radice: solo sulla build `--profile`, altrimenti «-» |
| layoutPerUnit · recalcStylePerUnit | `LayoutCount` e `RecalcStyleCount` di CDP (`Performance.getMetrics`) |
| scriptMs · layoutMs · recalcStyleMs · taskMs | le durate CDP sull'intera finestra (10 tasti + 600 ms) |
| longTasks · longTaskMs | dal `PerformanceObserver` |

Sotto la tabella, i nomi dei componenti più renderizzati (minificati: `?`, lettere — i primitivi di Radix tengono il
`displayName`). I conteggi sono deterministici: cinque run danno lo stesso numero, quindi un cambio di UNO è un
cambio vero.

**Prima/dopo del React Compiler** (PR #432, 2026-10-05, Mac, mirror, mediane di 5, build `--profile` senza / con
`reactCompiler`, con ogni componente compilato — `__tests__/reactCompilerCoverage.test.ts`): **Impostazioni 423 → 318**
componenti per tasto (render 6,12 → 4,09 ms); **Nuova spesa 242 → 1** (2,87 → 0,40 ms; commit 2 → 1); **cambio tab
1785,5 → 121,5** (18,42 → 2,55 ms; commit 5,5 → 3,5). A metà strada, col compiler acceso ma 48 componenti ancora saltati
(fra cui `SettingsPage`, `CashflowPage` ed `ExpenseDialog`), i numeri erano 401 · 76 · 1013,5: un componente saltato
rende di nuovo tutto il suo sottoalbero. Layout e style recalc quasi invariati, long task 0: il compiler toglie lavoro
di React, non del DOM. Il benchmark completo prima/dopo di quella sessione (`perf:bench -- --runs=3`) NON fu trascritto:
restano gli A/B ravvicinati di Cashflow (593 / 593 ms) e di Analisi (920 / 951) in § Registro, e la baseline in vigore
resta quella sopra.

**Prima/dopo delle righe leggere di Patrimonio** (PR #434, 2026-10-07, laptop Windows, mirror, mediane di 5, build `--profile`): **asset 562 → 0**
componenti per tasto, commit 2 → 0 (render 1,8 ms → nessuno; script sulla finestra 93 → 7 ms); expense 1 → 1. Il
compiler compilava `AssetDialog` ma lasciava il form del passo 2 fuori da ogni scope di memo, quindi un `useWatch` alla
radice ri-renderizzava tutto: i campi digitati sono letti da foglie che li osservano (doc/guide/patrimonio.md § Two-Step).
Per leggere i NOMI dei componenti al posto di `?`: `npm run perf:build -- --profile --no-mangling` (stessi conteggi).

**Prima/dopo dei colori letti una volta e del motion senza misure** (PR #441, 2026-10-08, laptop Windows, mirror
riseminato quel giorno, mediane di 5, build `--profile --no-mangling`): **mount Storico** commit 67 → 62, componenti
11357 → 10859, render 416,9 → 352,0 ms, script 1024 → 854 ms, Layout 173 → 168; **mount FIRE** 3344 → 3203 componenti,
render 123,4 → 96,8 ms, script 635 → 477 ms; **mount Panoramica** 1088 → 1046 (−13 `motion.div`, −6 `MeasureLayout`: il
wrapper `layout="position"`); per host 2 → 1 (Storico `ComposizioneTile`, FIRE `FIREProjectionChart` e `ScenariTile`, la
`CompositionBar` della Panoramica), `ChartColorsProvider` 3 render per sessione. **nav**: −1 `MeasureLayout` per cambio
(la pill nascosta), ma LayoutCount 31 → 34,3 — dentro il rumore (due giri «prima» davano 34 e 31): una misura su un
sottoalbero `display:none` non forza layout, il guadagno è lavoro di React e Framer. Il benchmark cold di quella sessione
(quattro giri alternati prima/dopo) NON separa i due: anche `auth`, che il cambio non tocca, oscillava 136–201 ms; CLS 0
ovunque, long task dentro il rumore.

**Prima/dopo di Impostazioni per tab** (PR #439, 2026-10-08, laptop Windows, mirror riseminato quel giorno, mediane di 5,
build `--profile`): **settings 286,1 → 32,1** componenti per tasto (commit 2 → 1, render 2,88 → 0,64 ms, script sulla
finestra 85 → 31 ms — −64%, sotto il −70% che la spec chiedeva: lo script della finestra porta anche Radix e il DOM, non solo
React —, task 185 → 97); **allocation 405,1 → 112,1** (render 2,43 → 1,33 ms, script 74 → 45 ms). Il 318 di
PERF-12 era il Mac con il mirror del 2026-10-05: il «prima» si rimisura sulla stessa macchina e lo stesso mirror del
«dopo». Dove sono andati: la pagina era un componente solo con 70 stati e ogni tasto lo rieseguiva intero (il compiler
non spezza un componente); ora è un orchestratore sotto 500 righe con UNA bozza (`useReducer`) e sei viste controllate
(`components/settings/tabs/*Tab.tsx`), quindi un tasto in Preferenze rende la vista Preferenze e l'orchestratore, mai le
altre; in Allocazione un gruppo di sottocategorie chiuso non è nel DOM (`CollapsibleContent` senza `forceMount`). A
metà strada il census leggeva 78 e 158: le due barre dei tab (12 `motion.button` e le icone) si ri-renderizzavano a ogni
tasto perché l'array dei tab era ricostruito a ogni render — memoizzato sulla STRINGA delle tab sporche, l'unico `useMemo`
a mano che il census ha giustificato. Il resto del `settings` sono i `TabsContent`/`Presence` di Radix e la vista stessa.

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
| Impostazioni | 398 (3) | 348 (3) | sì → sì (il documento delle impostazioni era letto con `staleTime: 0` — dal 2026-10-08 la pagina osserva `useSettings` e si semina dalla cache persistita: nessuno skeleton al reload, visto nel giro sul mirror, non rimisurato con `--revisit`) |

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

## Il censimento della prima schermata → `doc/guide/prima-schermata.md`

`npm run mobile:census` e `npm run mobile:budget` girano sulla STESSA build `.next-perf` servita da `perf:serve` su
:3200, mai accanto a `perf:bench` né alla suite Playwright: misurano la composizione della prima schermata, non il tempo.
Comandi, metriche, fixture e ratchet stanno nella loro guida (scorporata da qui il 2026-10-10, quando questa superò le
500 righe).
