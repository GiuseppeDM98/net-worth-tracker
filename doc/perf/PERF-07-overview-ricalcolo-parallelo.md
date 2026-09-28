# PERF-07 — La Panoramica: il ricalcolo in parallelo, la scrittura dopo la risposta, il tempo nel header

> Stato: da fare · Priorità: 2 · Sforzo: S · Dipende da: PERF-01 · Sblocca: PERF-08, PERF-09, PERF-10 (il `Server-Timing` che prova ogni misura lato server)

## 1. Il problema, misurato

`GET /api/dashboard/overview` è UNA lettura quando il riepilogo materializzato è fresco; ma
`DASHBOARD_OVERVIEW_SUMMARY_TTL_MS = 5 min` (`lib/services/dashboardOverviewConstants.ts:52`) e nessun cron lo prescalda: il
proprietario apre l'app ogni qualche ora, quindi quasi ogni apertura ricalcola. Il ricalcolo (`recomputeDashboardOverview`,
`lib/services/dashboardOverviewService.ts:566-640`, verificato) è in **sei stadi sequenziali**:

1. `get` del summary (`:643`)
2. `Promise.all(assets, snapshots, settings, goal)` (`:572-577`) — questi quattro rigettano la route se falliscono
3. `getPensionContributionsForUser` se c'è un fondo (`:581`)
4. `getAssetTransactionsAdmin` (`:589`) — degrada a «nessuna clausola vendite»
5. `Promise.all(E mese corrente, E mese precedente)` (`:598-601`) — degrada a `expenseStats: null`
6. **`await set(summaryDoc)`** (`:629`) — la scrittura ATTESA prima di rispondere

Con le funzioni Vercel in `iad1` e Firestore in Europa (confermato dal proprietario, 2026-09-26), ogni stadio è un viaggio
transatlantico da ~100 ms: sei stadi ≈ 600 ms di sola latenza, più il cold start della lambda. Sull'emulatore la route
risponde in ~100 ms: la latenza è invisibile in locale, ed è per questo che serve una misura NEL header.

Il payload dipende da «oggi»: `getItalyMonthYear()` sceglie mese corrente e precedente (`:567-570`) e `buildExpenseStats(…,
new Date())` (`:603`) proietta a fine mese sul giorno di oggi. Nessuna invalidazione scatta al cambio di giorno o di mese:
un TTL più lungo deve tenerne conto.

## 2. Obiettivo misurabile

- La route emette `Server-Timing` (`db;dur=…`, `compute;dur=…`, `total;dur=…`, `source;desc=materialized|recompute`): la misura
  che PERF-08 e il proprietario leggono dalle DevTools in produzione senza strumenti.
- Sull'emulatore: il ricalcolo passa da 6 stadi a **3** (get summary → un solo giro di letture → risposta), la scrittura del
  summary avviene DOPO la risposta (`after()` di `next/server`) e non compare nel `total`. Tempo della route in ricalcolo
  prima/dopo sull'emulatore (via `curl`), in SESSION_NOTES.
- Il riepilogo è stale se: `invalidatedAt` presente, o `sourceVersion` diversa, o **il giorno italiano di `computedAt` non è
  oggi** (il payload è del giorno), o più vecchio di **6 ore** (la rete di sicurezza, come `performance-cache`). Il TTL di 5
  minuti sparisce: ogni mutazione rilevante già invalida (`dashboardOverviewInvalidation*.ts`; il cron dello snapshot chiama
  `invalidateDashboardOverviewSummaryServer`, `app/api/portfolio/snapshot/route.ts:253`). Test che pinna i quattro casi.
- Benchmark cold Panoramica: invariato in locale (~150 ms); in produzione il proprietario legge `Server-Timing` prima/dopo.

## 3. Non-obiettivi

- Non si tocca il contenuto del payload né `DASHBOARD_OVERVIEW_SOURCE_VERSION` (20): nessuna cifra cambia.
- Non si prescalda con un cron (la freschezza per giorno + le invalidazioni lo rendono inutile; il primo accesso del giorno
  ricalcola una volta).
- La regione è PERF-08.

## 4. Design

**Un solo giro di letture.** Le letture non dipendono l'una dall'altra: `pensionContributions` va letta speculativamente
(costa una query vuota per chi non ha un fondo — accettabile, ed è dichiarato nel commento: «paghiamo una lettura vuota per
non pagare un round trip»), `transactions` e le due finestre di spese in parallelo con assets/snapshots/settings/goal. La
semantica di oggi resta: **assets, snapshots, settings e goal rigettano la route** (oggi non hanno fallback); **pensione,
ledger e spese degradano** alla loro clausola mancante con il loro `console.warn` (`:583-593`, `:602-606`). Quindi:
`Promise.all` dei quattro obbligatori e `Promise.allSettled` dei tre degradabili, lanciati insieme (`await Promise.all([core,
optional])`), mai in serie.

**Scrittura dopo la risposta.** `after(() => adminDb.collection(...).doc(userId).set(summaryDoc))` da `next/server`
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`; la lambda resta viva finché `after` finisce).
Il `try/catch` con `console.warn` resta dentro. `toResponsePayload` risponde con `source: 'live_recompute'` come oggi.

**Freschezza per giorno.** `isSummaryStale(summary, now)` (già esiste, `:529-544`) prende `now` (mai `new Date()` dentro:
AGENTS.md § Dynamic Imports, «Functions that call `new Date()` internally are untestable») e aggiunge il confronto del giorno
italiano (`getItalyDateIso(computedAt) !== getItalyDateIso(now)`, `lib/utils/dateHelpers.ts`); la costante
`DASHBOARD_OVERVIEW_SUMMARY_TTL_MS` passa a 6 h con il commento del PERCHÉ (la rete di sicurezza per un input che nessuna
invalidazione vede — un prezzo aggiornato fuori dal cron: verificare che `/api/prices/update` e il cron serale invalidino).

**`Server-Timing`.** Un helper `lib/server/serverTiming.ts` (`startTiming()` → `mark(name)` → `toHeader()`), puro e testato,
usato dalla route; nomi corti (`db`, `compute`, `total`), `desc` per la sorgente. Su Vercel il header passa; in locale si
legge con `curl -sD -` sulla route con un ID token, e `npm run perf:bench` lo scrive per ogni run in
`perf/last-run.json` (`api[].serverTiming`; a schermo la colonna API conta solo le chiamate).

## 5. File da toccare

- `lib/services/dashboardOverviewService.ts` — `recomputeDashboardOverview` a un giro; `after` per la scrittura;
  `isSummaryStale(summary, now)` con il giorno; `getDashboardOverview` restituisce anche i tempi.
- `lib/services/dashboardOverviewConstants.ts` — TTL 6 h.
- `app/api/dashboard/overview/route.ts` — il header.
- `lib/server/serverTiming.ts` — nuovo, puro, testato.
- `scripts/perfBenchmark.mjs` — niente: legge già `Server-Timing` dalle risposte `/api/*` (`attachNetwork`).
- Test: `__tests__/dashboardOverviewService.test.ts` (i quattro casi di freschezza; i tre rami degradabili; i quattro obbligatori
  che rigettano; payload identico a prima con tutti i rami ok), `__tests__/serverTiming.test.ts`, `__tests__/apiAuthRoutes.test.ts`
  (il header presente).

## 6. Passi

1. Tempo prima: la route chiamata sull'emulatore con un token (l'harness di `apiAuthRoutes.test.ts` o un `.mts` usa-e-getta),
   in ricalcolo (documento `invalidatedAt` piantato) e fresco.
2. `serverTiming.ts` + test; header nella route.
3. Il giro unico (`Promise.all` + `allSettled`) + `after`; test del payload identico (fixture di `dashboardOverviewService.test.ts`).
4. Freschezza per giorno + TTL 6 h + i quattro test; grep delle invalidazioni (prezzi, snapshot, cron).
5. Tempo dopo, stessa chiamata; benchmark Panoramica; nota per il proprietario su come leggere `Server-Timing` in produzione
   (DevTools → Network → la richiesta → Timing → Server Timing).

## 7. Test e falsificazione

- Freschezza: computato oggi 5 h fa, senza `invalidatedAt` → fresco; con `invalidatedAt` → stale; 7 h fa → stale; **computato
  ieri alle 23:50, `now` oggi 00:10** → stale (falsificare: togliere il confronto del giorno → il test lo vede fresco, rosso).
- Rami degradabili: T che rigetta → `monthSales: null` e il resto intatto; assets che rigetta → la route rigetta come oggi
  (falsificare: mettere assets in `allSettled` con fallback `[]` → il test vede un payload vuoto invece del rigetto).
- La scrittura dopo la risposta: mock di `after` che registra la callback; `set` NON chiamato prima del `return`, SÌ dentro
  la callback.
- Header: `Server-Timing` presente e parsabile (`total;dur=`).
- Suite: `apiAuthRoutes`, `dashboardOverviewService`, `dashboardOverviewUtils`, `overviewNarrative` (AGENTS.md § 5, area Overview).

## 8. Collaudo guidato

- C: i test visti rossi. D: la route chiamata direttamente con `curl` sull'emulatore risponde con il header e lo stesso JSON
  di prima (diff del payload con `source`/`freshness` escluse); l'invalidazione da una spesa nuova provata SULL'EMULATORE
  (aggiungere una spesa dall'app, richiamare la route: il mese cambia).
- F (proprietario, IN PRODUZIONE dopo il deploy, l'unico posto dove la latenza esiste — SOLO LETTURE: mai una scrittura di
  prova sui dati di produzione, WORKFLOW.md § 3): 1) DevTools → Network → `overview` → Server-Timing: `total` e `source`;
  2) ricaricare dopo 10 minuti: `source=materialized`; 3) il mattino dopo il primo accesso è `recompute` (il giorno è cambiato).
  Non coperto in locale: la latenza vera.
- G: nessun fixture da rimuovere (emulatori: le spese di prova cancellate DALL'APP).

## 9. Rischi e rollback

- Un input che cambia senza invalidazione = un numero vecchio per ore: la freschezza per giorno limita il danno a una
  giornata, il grep delle invalidazioni è il passo 4, il proprietario ha «Crea snapshot» che invalida.
- `after` su Vercel: dalla doc di Next 16; se il runtime non lo supportasse, fallback a `void set().catch(warn)` — già il
  pattern di `writePerformanceCache`.
- Rollback: TTL, giorno e `after` sono poche righe.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; doc/guide/panoramica.md (il ricalcolo a un giro, la freschezza per giorno e per 6 h, la regola «una
  mutazione invalida, il TTL è la rete», il `Server-Timing`); AGENTS.md § Caching (l'overview accanto agli altri);
  `Draft Release Temp.md`; doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-07-overview-ricalcolo-parallelo.md: il ricalcolo del riepilogo della
Panoramica passa da sei stadi sequenziali a un solo giro (Promise.all dei quattro obbligatori + allSettled dei tre
degradabili, lanciati insieme), la scrittura del summary avviene dopo la risposta con after() di next/server, la
freschezza diventa «stesso giorno italiano, max 6 ore, mai dopo un'invalidazione» (le invalidazioni coprono le mutazioni:
verificalo con un grep e dimmelo), e la route emette Server-Timing (db, compute, total, source). Nessuna cifra del payload cambia.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Server Layer and API Authorization, § Caching, § Firestore Writes, § Dynamic Imports:
  le funzioni con new Date() dentro), CLAUDE.md
- Leggi doc/guide/panoramica.md e doc/guide/e2e-emulatori.md (§ Emulator Exercise Scripts)
- Leggi node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-07 per intero; PERF-01 deve essere chiusa
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Chiusura: il tempo della route in ricalcolo PRIMA e DOPO sull'emulatore (stessa chiamata, in SESSION_NOTES); i test di
§ 7 visti ROSSI una volta (in particolare il caso «ieri 23:50 / oggi 00:10»); il payload identico prima/dopo (diff con
source e freshness escluse); l'invalidazione da una spesa provata sull'emulatore; le suite dell'area Overview verdi; tsc,
lint 0, Vitest in Europe/Rome; il giro guidato è in PRODUZIONE dopo il deploy e in SOLA LETTURA (scrivimi i tre punti da
guardare nelle DevTools); CLAUDE.md «Latest», doc/guide/panoramica.md, AGENTS.md § Caching, Draft Release Temp.md (senza
dati privati), doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Perimetro piccolo (un servizio, una route, una costante) con regole chiare; i due punti
delicati — la rete delle invalidazioni e la freschezza per giorno — hanno un grep e un test che li pinnano.
