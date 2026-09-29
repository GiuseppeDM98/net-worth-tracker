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

Sotto la tabella, i chunk iniziali più grandi con le route che li usano: è così che si vedono le copie di recharts
(quattro chunk da 350 KB raw, uno per pagina) e il PDF nel grafo di Storico.

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
| — | — | — | — | nessuno finora |

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
`--revisit` (il secondo caricamento della route dopo una prima visita, per PERF-03). La porta è :3200 perché :3000 è
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

## Baseline in vigore (2026-09-28, laptop Windows, mirror, nessun throttling)

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

**Warm** (mediane di 3, ms dal click):

| Pagina | skeleton | primo numero | long task | Firestore | API |
|---|---|---|---|---|---|
| Panoramica | 0/3 | 83 | 0 | 0 | 0 |
| Patrimonio | 0/3 | 114 | 0 | 2 | 0 |
| Cashflow | 3/3 | 1952 | 476 | 4 | 0 |
| Analisi | 0/3 | 252 | 189 | 2 | 0 |
| Rendimenti | 3/3 | 630 | 0 | 14 | 17 |
| Storico | 3/3 | 1428 | 399 | 8 | 0 |
| Hall of Fame | 3/3 | 127 | 0 | 2 | 0 |
| Allocazione | 3/3 | 288 | 83 | 5 | 1 |
| FIRE e Simulazioni | 3/3 | 2082 | 142 | 6 | 0 |
| Previdenza | 3/3 | 129 | 0 | 2 | 0 |
| Impostazioni | 3/3 | 356 | 0 | 6 | 0 |

**Bundle** (gz KB, chunk iniziali; il tetto in `budget.json` è +2%): condivisi 459,9 (21 chunk) · landing 448,3 ·
login 415,3 · Panoramica 535,0 · Patrimonio 718,2 · Cashflow 729,2 · Analisi 741,4 · Rendimenti 680,2 · **Storico
1189,2** (il PDF: un chunk da 513 KB gz) · Hall of Fame 533,9 · Allocazione 515,8 · FIRE 743,5 · Previdenza 588,9 ·
Assistente 656,4 · Impostazioni 612,6.
