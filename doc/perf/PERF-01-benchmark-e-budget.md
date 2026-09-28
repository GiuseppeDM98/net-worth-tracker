# PERF-01 — Il benchmark in repo e il budget che può solo scendere

> Stato: da fare · Priorità: 1 (va PRIMA di ogni altra spec PERF, dopo la sola PERF-00, chiusa il 2026-09-28) · Sforzo: M · Dipende da: PERF-00 (la baseline la contiene) · Sblocca: 02, 04, 05, 07, 12 — e tutte le altre, che si dichiarano chiuse con i suoi numeri

## 1. Il problema, misurato

Oggi non esiste una misura ripetibile della velocità dell'app. Il 2026-09-26 ne è stata fatta una con uno script usa-e-getta,
conservato in `doc/perf/reference/perf-measure.mjs` insieme ai dati grezzi (`baseline-2026-09-26-cold.log`,
`baseline-2026-09-26-warm.json`): build di produzione isolata (`NEXT_DIST_DIR=.next-perf`) servita dal server standalone
contro gli emulatori, account mirror del proprietario (25 asset, 1533 spese, 45 snapshot), Chromium headless 1440×900, 3 run
per pagina, mediane. È la baseline citata da ogni spec PERF (laptop Windows: i TEMPI si confrontano solo sulla stessa
macchina, i CONTEGGI ovunque):

| Pagina | primo numero (ms) | LCP (ms) | long task (ms) | richieste Firestore | chiamate API |
|---|---|---|---|---|---|
| Panoramica | 150 | 680 | 93 | 3 | 1 |
| Patrimonio | 790 | 1230 | 270 | 8 | 1 |
| Cashflow › Tracciamento | 2110 | 2200 | 400 | 3 | 0 |
| Analisi | 1690 | 1710 | 565 | 3 | 0 |
| Rendimenti | 1110 (1000–2070) | 1140 | 144–377 | 10–14 | 17 |
| Storico | 2285 | 2300 | 670 | 3 | 0 |
| Allocazione | 590 | 610 | 165 | 4 | 1 |
| Previdenza | 584 | 600 | 96 | 4 | 0 |
| FIRE | 2040 | 2050 | 300 | 7–8 | 0–1 |
| Hall of Fame | 510 | 530 | 88 | 3 | 0 |
| Impostazioni | 527 | 548 | 93 | 5 | 0 |

«Primo numero» = millisecondi dal `navigationStart` alla prima cifra in euro dentro `main`. Lo spinner di `ProtectedRoute`
(Firebase Auth) se ne va fra 86 e 228 ms. Firestore emulato risponde in ~1 ms: in produzione ogni round trip vale 50–150 ms,
quindi le pagine con più richieste in serie sono più lente di quanto la tabella mostri.

Il post di Anthropic («How we made claude.ai faster», agosto 2026) parte da qui: prima le misure dei viaggi che contano,
poi benchmark di laboratorio deterministici, poi un **ratchet** in CI — ogni metrica ha un tetto che può solo scendere, e una
PR che lo alza fallisce. Senza questo pezzo ogni altra spec chiude «a sensazione».

Dimensioni della build (gzip, chunk iniziali letti dall'HTML prerenderizzato): condivisi da ogni pagina 460 KB (21 chunk);
Panoramica 535 · Patrimonio 717 · Cashflow 726 · Analisi 734 · Rendimenti 681 · Storico 1192 · Allocazione 510 · Previdenza 589 ·
FIRE 743 · Hall of Fame 534 · Impostazioni 610 · Assistente 657 · login 415.

**Questa baseline è di `develop` PRIMA dei contributi del 2026-09-27**: il Flusso per ruolo 50/30/20 e il Flusso sul
telefono (#400, #401), il chip di classe composito di Strumenti (#403) e, subito dopo, la nuova Esposizione
(PR #407: `lib/utils/exposureEngine.ts`, `app/api/portfolio/instrument-profiles/route.ts`). Sono entrati tutti prima di questa spec (proprietario, 2026-09-27; `doc/perf/README.md` § 5):
`perf/budget.json` si scrive dalla build che li contiene, non da questa tabella, e le righe Analisi, Cashflow,
Impostazioni, Patrimonio e Allocazione qui sopra restano come storia. Allocazione, in particolare, non chiama più
Yahoo a regime (solo per un ticker mai visto o scaduto, § 4): i 590 ms erano la cache che non andava mai a segno.

## 2. Obiettivo misurabile

- `npm run perf:bench -- --email=mirror@example.com` produce, in meno di 10 minuti, la tabella sopra (cold + warm) su una
  build di produzione servita contro gli emulatori, e scrive `perf/last-run.json` (gitignored) e una riga di riepilogo.
- `npm run perf:budget` legge la build (`.next*/server/app/**/*.html` → chunk iniziali → gzip) e confronta ogni route con
  `perf/budget.json`; esce 1 se una route supera il suo tetto, o se un tetto sale senza un `raisedBy` nuovo. Il tetto iniziale è la misura di oggi arrotondata per eccesso
  (+2%), e una spec che riduce una route ABBASSA il tetto nello stesso commit (il ratchet).
- Un test Vitest (`__tests__/perfBudget.test.ts`) prova che il confronto va rosso su un tetto violato (falsificazione con un
  fixture), così il budget non è mai un check che «non ha mai visto rosso».
- Un test Vitest (`__tests__/perfRoutes.test.ts`) prova che `perf/routes.json` coincide con `lib/constants/navigation.ts`.

## 3. Non-obiettivi

- Nessuna ottimizzazione del codice dell'app: questa spec misura e basta.
- Niente RUM in produzione (Vercel Analytics / Speed Insights): è una scelta a parte del proprietario (costo, privacy);
  la spec lascia il punto in § 9.
- Niente CI: il repo non ha `.github/workflows`. Il budget gira in locale (`npm run perf:budget` dopo `npm run build`) e la
  spec descrive il job GitHub Actions come passo opzionale.

## 4. Design

**Due script, due domande.** `scripts/perfBenchmark.mjs` risponde «quanto ci mette l'app a mostrare un numero?»; `scripts/perfBudget.mjs`
risponde «quanto JS spedisce ogni route?». Il primo è lento e ha bisogno di emulatori + build + server; il secondo legge file
su disco e gira in due secondi.

**Il benchmark** (la versione ripulita di `reference/perf-measure.mjs`):
- Playwright (`playwright` è già in `node_modules` come dipendenza di `@playwright/test`), Chromium headless, viewport 1440×900
  e, con `--mobile`, 390×844 + `Emulation.setCPUThrottlingRate 4` via CDP (il telefono, AGENTS.md § Motion: budget CPU 3–5×).
- `addInitScript` con `PerformanceObserver` bufferizzati per `largest-contentful-paint`, `layout-shift`, `longtask`, `paint`, e
  un `MutationObserver` che segna: `auth` (lo spinner `.animate-spin.rounded-full` sparisce — **PERF-02 toglie lo spinner e
  ridefinisce questo marcatore** come «il nome del profilo appare nella sidebar»; il marcatore vive in una funzione sola
  dello script, con il commento che lo dice), `h1`, `data` (prima cifra `/\d\s?€/` nel `textContent` di `main`),
  `skeleton`/`skeletonGone` (`[data-slot="skeleton"]`). ATTENZIONE alla trappola vista in sessione: la closure deve leggere
  `window.__perf.marks` a ogni chiamata, non catturarla una volta, o il reset fra una navigazione e l'altra scrive su un
  oggetto morto.
- **Cold**: contesto nuovo, login vero sul form (`#email`, `#password`, «Accedi» con `exact: true`, `waitForURL(/dashboard/)`),
  poi `goto` della route con `waitUntil: 'load'` e attesa di `h1 && data` (timeout 20 s, MAI `networkidle`: Firestore tiene i
  socket aperti). **Warm**: un contesto, un login, poi le route una dopo l'altra cliccando i link della sidebar
  (`a[href="…"]`, la scena di pagina) e misurando dal click: `url` (pathname cambiato), `skeleton` (la nuova pagina ha
  mostrato un'attesa), `data` (cifra in euro senza skeleton), long task nel frattempo.
- Contabilità di rete per navigazione (`page.on('response')` + `request.sizes()`), classificata: `firestore` (host :8080 o
  `firestore`), `auth`, `api` (`/api/*` con durata e, da PERF-07, il header `Server-Timing`), `js`, `css`, `font`, `external`
  (yahoo, borsaitaliana, frankfurter dal BROWSER). Yahoo è chiamato dal server, quindi il benchmark lo vede solo come
  tempo della route `api`: la route dei profili (`/api/portfolio/instrument-profiles`, `lib/server/exposure/instrumentProfileService.ts`) lo chiama solo per un
  ticker assente o scaduto in `instrument-profile-cache` (o con «Aggiorna», `force=true`), e `emulators:seed` precompila i ticker della fixture. Per Allocazione il benchmark
  stampa la run 1 accanto alla mediana: una run 1 molto più lenta delle altre è un ticker non seminato (il mirror ne ha
  di suoi), non una regressione.
- Output: `perf/last-run.json` con tutte le run e la tabella di mediane; a schermo la tabella. Opzioni: `--runs`, `--cpu`,
  `--email`, `--routes` (nomi come in `perf/routes.json`, con o senza `/dashboard/`), `--warm-only`, `--cold-only`, `--mobile`,
  `--revisit` (PERF-03: reload dopo una visita). **Sempre `npm run perf:bench -- --opzione`**: senza il `--`, npm tiene le
  opzioni come `npm_config_*` e lo script non le vede.
- **Le route** vengono da `perf/routes.json`, tracciato, e `__tests__/perfRoutes.test.ts` fallisce se diverge da
  `lib/constants/navigation.ts` (lo script è `.mjs` puro e non importa l'alias `@/`; il test è la parità). La route
  `/dashboard/dividends` NON esiste (Dividendi è `?tab=dividends` di Cashflow) — e WORKFLOW.md § 3 la elenca ancora fra «The
  routes»: correggerlo nello stesso commit.
- **La porta è :3200**: :3000 è il server del giro (`dev:emulator`), :3100 è del server Playwright (`dev:e2e`); il benchmark
  non deve contendere né l'uno né l'altro.

**Il budget**: `perf/budget.json` = `{ "routes": { "/dashboard": { "initialJsGzKB": 546 }, "/dashboard/analisi":
{ "initialJsGzKB": 760, "raisedBy": "#NNN: perché" }, … }, "sharedGzKB": 470, "libraryCopies": { "recharts": 1 } }`
(`raisedBy` facoltativo, § 9; `libraryCopies` da PERF-04). Lo script trova la build (`NEXT_DIST_DIR` o `.next`), per ogni
`server/app/<route>.html` estrae i `<script src="/_next/static/chunks/…">`, somma il gzip dei file (`zlib.gzipSync`), conta i
caratteri di testo dell'HTML (PERF-02 lo alza da 46) e confronta. Stampa la tabella route | chunk | raw KB | gz KB | testo |
tetto | esito, e la lista dei chunk più grandi con le route che li usano (è così che il 2026-09-26 sono emerse le quattro
copie di recharts: quattro chunk diversi da 350 KB raw, uno per pagina). Esce 1 al primo sforamento. La funzione di
confronto è pura in `lib/utils/perfBudget.ts` (`compareRoutesToBudget(measured, budget, previousBudget)`), importata dallo script e dal test. `previousBudget` è
`perf/budget.json` di `HEAD`, letto dallo script con `git show HEAD:perf/budget.json` (`null` se in HEAD il file non c'è: il
commit di questa spec). Un tetto più alto del precedente passa solo con un `raisedBy` DIVERSO da quello del precedente,
così una motivazione vecchia non copre una crescita nuova.

**Perché non Lighthouse**: misura una pagina pubblica; qui tutto sta dietro il login e il dato utile arriva dopo tre round trip.
Il benchmark misura il viaggio che conta per il proprietario: «apro Cashflow, quando vedo il mese?».

## 5. File da toccare

- `scripts/perfBenchmark.mjs` — nuovo: il benchmark (sopra). `.mjs` come `scripts/emulators.mjs`.
- `scripts/perfBudget.mjs` — nuovo: legge la build e chiama `lib/utils/perfBudget.ts` (via `tsx`? No: lo script `.mjs` non
  importa `.ts`. La funzione pura sta in `lib/utils/perfBudget.ts` per il test e lo SCRIPT è `scripts/perfBudget.mts` lanciato
  con `tsx`, come i seed — così importa l'alias e la funzione).
- `perf/budget.json`, `perf/routes.json` — nuovi, tracciati. `perf/README.md` — come si lancia, cosa significa ogni colonna,
  la baseline misurata in questa sessione sulla build che contiene #400/#401/#403 e la nuova Esposizione (#407; quella del 2026-09-26 resta in
  `doc/perf/README.md` come storia) e il registro dei tetti alzati (§ 9).
- `lib/utils/perfBudget.ts` — la funzione pura. `__tests__/perfBudget.test.ts`, `__tests__/perfRoutes.test.ts`.
- `package.json` — script `perf:build` (`cross-env NEXT_DIST_DIR=.next-perf NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true … next build`),
  `perf:serve` (copia `static` e `public` nello standalone e lo avvia su :3200 con le variabili degli emulatori — la ricetta di
  SETUP.md «`npm run start` refuses to serve the build»; ATTENZIONE: su Windows lo standalone finisce in
  `.next-perf/standalone/Documents/GitHub/net-worth-tracker/`, lo script deve trovare `server.js` con una ricerca, non con un
  percorso fisso), `perf:bench`, `perf:budget`.
- `.gitignore` — `perf/last-run.json`.
- `WORKFLOW.md` § 3 — la lista delle route senza `dividends`. `SETUP.md` — dove finisce lo standalone su Windows (è la sezione
  della build di produzione: AGENTS.md manda lì le trappole della verifica su build).
- `eslint.config.mjs` — verificare che `scripts/*.mjs` e `scripts/*.mts` siano lintati.

## 6. Passi

1. Portare `doc/perf/reference/perf-measure.mjs` in `scripts/perfBenchmark.mjs`: route da `perf/routes.json`, porta :3200,
   marcatore `auth` in una funzione sola, `--revisit`, `Server-Timing` nella colonna API.
2. `lib/utils/perfBudget.ts` + `scripts/perfBudget.mts`; test Vitest con un budget violato → rosso; test di parità delle route.
3. `npm run perf:build && npm run perf:serve` (in due terminali del proprietario, con gli emulatori e il mirror seminato:
   `npm run mirror:seed -- <email>`), poi `npm run perf:bench -- --email=mirror@example.com --runs=3`.
4. Scrivere `perf/budget.json` dalla build di oggi (+2%, arrotondato per eccesso: 535 → 546), lanciare `perf:budget` → verde;
   alzare artificialmente un chunk (un `import '@react-pdf/renderer'` in Panoramica, poi rimosso) → rosso.
5. `perf/README.md` con la baseline e le istruzioni; CLAUDE.md § Testing una riga; WORKFLOW.md e SETUP.md.
6. Opzionale: `.github/workflows/perf-budget.yml` che fa `npm ci && npm run build && npm run perf:budget` (senza emulatori,
   con le `NEXT_PUBLIC_*` fittizie del `dev:emulator`).

## 7. Test e falsificazione

- `__tests__/perfBudget.test.ts`: `compareRoutesToBudget` con una route sopra il tetto → `ok: false` e il nome della route;
  con tutte sotto → `ok: true`. Falsificazione: invertire il segno del confronto e vedere il test rosso.
- `__tests__/perfRoutes.test.ts`: `perf/routes.json` = le `href` di `navigation.ts`; falsificare aggiungendo `/dashboard/dividends`.
- Il tetto alzato: `compareRoutesToBudget` con un tetto più alto del precedente e senza `raisedBy` → `ok: false`; con
  `raisedBy` → `ok: true`; con lo stesso `raisedBy` del precedente → `ok: false`; con `previousBudget` `null` → nessun
  controllo di salita. Il tetto precedente lo legge lo script da `git show HEAD:perf/budget.json` e lo passa alla
  funzione pura come argomento; falsificare togliendo il controllo: il tetto sale in silenzio e il test è rosso.
- Il benchmark si prova rompendo il rilevatore: cambiare la regex dell'euro in una che non esiste e vedere `settled=false`
  su ogni pagina (è successo davvero il 2026-09-26 con `\d,\d{2}\s?€` su Analisi, che stampa cifre senza decimali).
- Suite esistenti: `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`.

## 8. Collaudo guidato

- Fase C (automatica): `perf:bench` gira e produce la tabella; `perf:budget` verde sulla build e rosso con il chunk iniettato.
- Fase F (proprietario, ≤5 punti): aprire `perf/README.md` e verificare che la tabella sia leggibile e che il comando descritto
  parta dai suoi terminali; nient'altro è visivo.
- Fase G: `npm run mirror:remove`, `.next-perf` cancellata, nessun `.tmp-*` rimasto.

## 9. Rischi e rollback

- Il benchmark ha rumore ±10% sul laptop (il 2026-09-26: Rendimenti fra 1000 e 2070 ms in tre run per un `performance-cache`
  freddo alla prima). Tre run e la mediana bastano per un budget di dimensione; per i tempi la spec successiva confronta
  prima/dopo nella STESSA sessione, mai fra macchine diverse.
- Un tetto troppo stretto blocca PR legittime: il tetto è +2% e si abbassa solo con una misura, mai a mano.
- **Una funzione nuova può alzare un tetto** (proprietario, 2026-09-27): una spec o una PR, anche di un contributore, che
  fa crescere una route oltre il suo tetto lo ALZA nello stesso commit, con la misura prima/dopo di `perf:budget` e una
  riga in `perf/README.md` («Analisi +N KB gz: #NNN, perché»). Il ratchet vieta la crescita non dichiarata, non la
  funzione; il tetto alzato torna a scendere con la prossima spec che riduce. Senza la riga di motivazione il controllo
  resta rosso: `perf/budget.json` porta per ogni route un campo `raisedBy` facoltativo, e `compareRoutesToBudget` lo
  pretende quando il tetto è più alto di quello del commit precedente (§ 7).
- RUM in produzione (Vercel Speed Insights) resta una decisione del proprietario: darebbe le p75 vere sul suo telefono.
- Rollback: gli script sono additivi; cancellarli non tocca l'app.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» + § Testing (una riga sui due comandi). `Draft Release Temp.md` (entry «dev»: nessun dato privato, cifre
  tonde). WORKFLOW.md § 3 (le route). SETUP.md (lo standalone su Windows; la porta :3200 accanto a :3000 e :3100).
- `doc/perf/README.md` (questa cartella): segnare PERF-01 come fatta e la data della nuova baseline.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo la specifica doc/perf/PERF-01-benchmark-e-budget.md: il benchmark di velocità in
repo (scripts/perfBenchmark.mjs, dalla versione di riferimento doc/perf/reference/perf-measure.mjs), il budget di
dimensione per route (lib/utils/perfBudget.ts + scripts/perfBudget.mts + perf/budget.json), la parità delle route
(perf/routes.json + test), il test che prova che il budget può andare rosso e la regola del tetto alzato (una route
che cresce alza il suo tetto nello stesso commit, con `raisedBy`: § 9 e § 7).

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha), CLAUDE.md (stato corrente, known issues)
- Leggi doc/guide/e2e-emulatori.md (gli emulatori, i trap di Playwright) e SETUP.md § «npm run start refuses to serve the build»
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e poi la spec PERF-01 per intero, § 4-7 e § 9 in particolare; la nuova
  Esposizione (PR #407, 2026-09-28) è già in develop e la baseline la contiene
- Crea SESSION_NOTES.md per tracciare il lavoro; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit per sessione; rispondi in italiano.
Vincoli tecnici della spec: le route da perf/routes.json con il test di parità contro lib/constants/navigation.ts; il
marcatore auth in una funzione sola; il rilevatore legge window.__perf.marks a ogni chiamata; mai networkidle; login sul
form vero; porta :3200; le opzioni sempre dopo «--» (npm run perf:bench -- --runs=3); lo standalone su Windows sta sotto
.next-perf/standalone/Documents/GitHub/net-worth-tracker/ — cercalo, non fissarlo.
Chiusura: perf:bench produce la tabella cold+warm sull'account mirror (npm run mirror:seed -- <email>, poi mirror:remove);
perf:budget verde sulla build e ROSSO con un chunk iniettato apposta (dimmi cosa hai iniettato e cosa ha stampato); i due
test Vitest visti rossi una volta; tsc, lint e Vitest in Europe/Rome verdi. Poi aggiorna CLAUDE.md «Latest» e § Testing,
WORKFLOW.md § 3 (via «dividends» dalle route), SETUP.md, Draft Release Temp.md (senza dati privati), doc/perf/README.md
(PERF-01 fatta, nuova baseline) e proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Lavoro di tooling con trappole note (Windows, standalone, Playwright, npm e il `--`) ma
nessuna regola di dominio da rispettare: un modello di fascia alta con effort alto basta; Fable 5.1 non aggiunge valore su uno script.
