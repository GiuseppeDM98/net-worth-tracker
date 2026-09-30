# PERF-10 — Le route server leggono una volta: le statistiche dividendi, le thread dell'assistente (l'Esposizione ha già la sua cache)

> Stato: da fare · Priorità: 2 · Sforzo: S/M · Dipende da: PERF-07 (`Server-Timing`), PERF-00 (chiude § A) · Sblocca: —

## 1. Il problema, misurato

Tre route lette il 2026-09-26, tutte verificate a riga:

**A. `/api/portfolio/exposure` non andava MAI in cache — CHIUSA dalla nuova Esposizione (PR #407, 2026-09-28)**
(proprietario, 2026-09-27: la proposta #402 è entrata prima di PERF-01 e ha riscritto l'Esposizione). Resta qui la
diagnosi, perché è il «prima» della sua misura. La route calcolava `expectedCacheKey = ${etfCount}-${etfTickers}-${round(total)}`
(`app/api/portfolio/exposure/route.ts:55`, tre segmenti, il totale calcolato inline) e confrontava con `cached.cacheKey`
(`:67`, insieme a un TTL server di 24 h, `:11`); il servizio salvava
`${etfCount}-${etfTickers}-${stockTickers}-${round(totalPortfolioValue)}` (`lib/server/portfolioExposureService.ts:336`,
QUATTRO segmenti, il totale da `resolveAssetValueEur`) e la route lo persisteva così (`:83`). I due formati non
coincidevano mai, nemmeno senza azioni dirette (il segmento vuoto lascia `--`) → `computePortfolioExposure` a ogni apertura
di Allocazione → **Yahoo `quoteSummary` per ogni ETF e azione** (`:118`, `:147`), in parallelo (`Promise.allSettled`,
`:114-158`). Benchmark: Allocazione 590 ms cold / 606 warm CON GLI EMULATORI — i 600 ms erano Yahoo vero. La nuova Esposizione ha ritirato
route, servizio e `exposure-cache/{userId}`: le risposte di Yahoo vivono per ticker in `instrument-profile-cache`, e la
pesatura si rifà a ogni apertura NEL BROWSER (decisione del proprietario, 2026-09-28, doc/guide/allocazione.md § Esposizione:
`GET /api/portfolio/instrument-profiles?userId=<ownerId>` risponde solo `{ profiles, oldestFetchedAt }`, il motore
`lib/utils/exposureEngine.ts` gira in un `useMemo` sugli asset della pagina). Il `Server-Timing` di § 2 si aggiunge a
QUELLA route, in `lib/server/exposure/instrumentProfileService.ts` (i conteggi `hits`/`fetched` sono per modulo).

**B. `/api/dividends/stats`: sette `await` in serie e D letta tre volte** (`app/api/dividends/stats/route.ts:106, 109, 112, 116,
123, 144, 173`): `calculateDividendStats` per il periodo (con le date legge per intervallo, `dividendService.ts:417-421`), di
nuovo per all-time (TUTTA D), `getUpcomingDividends`, A, S, T, poi `getAllDividends` (tutta D di nuovo). La tab Dividendi
chiama in più `/api/dividends` (D ancora, `cashflow/page.tsx:132-162`). Con `iad1` → Europa: sette viaggi ≈ 700 ms prima delle
statistiche.

**C. Assistente:** `listAssistantThreads` senza `limit` (`lib/server/assistant/store.ts:184-189`: cresce per sempre). Il
documento di memoria è letto due volte per apertura (route memory + `context/route.ts:52`): è una lettura piccola che gating
il builder (`includeDummySnapshots`), e i quattro builder devono restare identici fra loro (doc/guide/assistente.md) — resta
com'è, dichiarato in § 3.

## 2. Obiettivo misurabile

- A: **solo la misura di chiusura che la nuova Esposizione non poteva avere** (PERF-07 non esisteva): `Server-Timing` sulla route
  `/api/portfolio/instrument-profiles` (`db`, `yahoo`, i due conteggi `hits` e `fetched`, e `source=cache` quando tutti i profili vengono dalla
  cache, `source=yahoo` quando almeno uno è stato chiesto a Yahoo), e il benchmark di Allocazione che conferma
  zero chiamate a Yahoo alla seconda apertura (`total` < 100 ms in locale). Il test «seconda chiamata → mock Yahoo a 0
  chiamate» esiste già (`__tests__/instrumentProfilesRoute.test.ts`): qui si rilegge, non si riscrive.
- B: la route fa **un** `Promise.all` (D, A, S, T; l'upcoming derivato o in parallelo) e deriva periodo/all-time/upcoming in
  memoria; `Server-Timing` con `db` una volta; risposta identica (diff del JSON prima/dopo su fixture).
- C: thread con `limit(50)` + cursore (`startAfter`) esposto dalla route e usato dal client (`useInfiniteQuery` con «Mostra
  altre» nella lista): nessuna thread sparisce in silenzio.
- Benchmark: Allocazione warm senza Yahoo; Cashflow › Dividendi prima/dopo (`Server-Timing`).

## 3. Non-obiettivi

- L'Esposizione non è più di questa spec: cosa calcola, la base, la leva come nozionale e la cache per ticker li ha decisi
  il proprietario il 2026-09-28 (doc/guide/allocazione.md § Esposizione). Qui si aggiunge solo il `Server-Timing`.
- Non si toccano i numeri delle statistiche dividendi: sono derivazioni dello stesso D.
- Non si tocca il protocollo dell'assistente né i builder di contesto («a new required bundle field means updating ALL 4
  builders»); la doppia lettura della memoria resta.

## 4. Design

**A. `Server-Timing` sulla route dei profili.** Il servizio dei profili (`resolveInstrumentProfiles`,
`lib/server/exposure/instrumentProfileService.ts`) restituisce accanto ai profili quanti ne ha presi dalla cache e quanti
da Yahoo; la route li scrive nel header con il helper di PERF-07. § A non tocca la chiave né il TTL: sono del servizio.

**B. Un giro.** `Promise.all([getAllDividends, getUserAssetsAdmin, getUserSnapshotsAdmin, getAssetTransactionsAdmin])`; poi
`summarizeDividendStats(all, { startDate, endDate, assetId, now })` e `summarizeDividendStats(all, { now })` come funzioni PURE
sull'array già letto — `calculateDividendStats` oggi legge da solo E costruisce «oggi» con `setHours` sul server
(`dividendService.ts:430-431`): la funzione pura prende `now` (AGENTS.md: «Functions that call `new Date()` internally are
untestable»); la lettura resta nella route. `upcoming` dallo stesso array se `getUpcomingDividends` è un filtro per data
(leggere: se è una query `where paymentDate >= today` è lo stesso array filtrato in memoria). Le funzioni pure vivono in
`lib/utils/dividendAnalytics.ts`, dove già stanno le analisi dei dividendi; ricevuti e annunciati MAI in una cifra sola
(doc/guide/cashflow-dividendi.md).

**C.** `listAssistantThreads(userId, { limit = 50, after? })`; la route accetta `?after=<threadId>`; `useAssistantThreads`
diventa `useInfiniteQuery` e la lista mostra «Mostra altre» quando c'è una pagina dopo (senza UI il `limit` nasconderebbe
in silenzio la 51ª: non accettabile).

**`Server-Timing`** (PERF-07) su tutte e tre le route: è la misura di chiusura.

## 5. File da toccare

- `app/api/portfolio/instrument-profiles/route.ts`, `lib/server/exposure/instrumentProfileService.ts` — solo il
  `Server-Timing` e i due conteggi.
- `app/api/dividends/stats/route.ts`, `lib/utils/dividendAnalytics.ts` (le funzioni pure con `now`), `lib/services/dividendService.ts`.
- `lib/server/assistant/store.ts`, `app/api/ai/assistant/threads/route.ts`, `lib/hooks/useAssistantThreads.ts`,
  `components/assistant/AssistantThreadList.tsx` («Mostra altre»).
- Test: `__tests__/instrumentProfilesRoute.test.ts` (il header, accanto ai casi esistenti),
  `__tests__/dividendAnalytics.test.ts` (periodo/all-time/upcoming da un array, con `now`),
  `__tests__/apiAuthRoutes.test.ts` (le route: stessa risposta), `__tests__/assistantRoutes.test.ts` (limit e cursore).

## 6. Passi

1. A: il `Server-Timing` sulla route dei profili.
2. B: funzioni pure + test con attesi presi dalla risposta della route vecchia su fixture; la route a un giro; diff.
3. C: limit + cursore + «Mostra altre».
4. `Server-Timing` sulle tre; benchmark Allocazione e Cashflow › Dividendi prima/dopo.

## 7. Test e falsificazione

- Route dei profili: il header dice `source=cache` alla seconda chiamata; falsificare forzando il TTL a zero → `source=yahoo`.
- Statistiche: le funzioni pure riproducono gli attesi della route vecchia (fixture con 7 dividendi come il mirror);
  falsificare sommando ricevuti e annunciati → rosso; `now` a fine anno → l'upcoming cambia (prova che `now` è letto).
- Thread: 60 thread → 50 + cursore → 10; falsificare il cursore (`startAt` invece di `startAfter`) → 11.
- Suite: area Dividendi/cron, Allocazione, Assistant (le «Suites» in § Files di cashflow-dividendi.md, allocazione.md e assistente.md, sotto doc/guide/); `e2e/allocation.spec.ts`; E2E Dividendi.

## 8. Collaudo guidato

- C: le tre falsificazioni. D: `curl` delle tre route (200) e, per tutte e tre, il 403 su un altro utente con il proprio
  documento come controllo positivo — dal 2026-09-28 anche la route dell'Esposizione prende `userId` (l'owner) e
  `assertCanAccessAccount`: prima leggeva gli asset del token, e un membro delegato vedeva la propria esposizione sulla
  pagina dell'owner.
- F (mirror): 1) Allocazione › Esposizione apre in un attimo la SECONDA volta, e nelle DevTools il header dice
  `source=cache` (la prima, sul mirror appena seminato, può dire `yahoo`: i suoi ticker non sono nel seed); 2) Cashflow ›
  Dividendi: le statistiche identiche (ricevuti / annunciati separati); 3) Assistente: le thread ci sono tutte (6 < 50) e
  «Mostra altre» non appare; 4) «Aggiorna» dell'Esposizione (`force=true`) rifà Yahoo: `source=yahoo`. Non coperto: rate
  limit di Yahoo in produzione.
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- B e C non dipendono da A e possono chiudere da sole.
- Rollback per route (tre blocchi indipendenti).

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; doc/guide/allocazione.md (il `Server-Timing` della route dei profili), cashflow-dividendi.md (le
  funzioni pure della route, `now`), assistente.md (limit, cursore, «Mostra altre»); `Draft Release Temp.md`;
  doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-10-route-server-leggere-una-volta.md: (A) SOLO il Server-Timing
sulla route dei profili dell'Esposizione (/api/portfolio/instrument-profiles), già riscritta il 2026-09-28
(lib/server/exposure/instrumentProfileService.ts): la chiave e la cache NON si toccano; (B) /api/dividends/stats legge D, A, S, T una volta in un Promise.all e
deriva periodo, all-time e upcoming da funzioni pure che prendono now; (C) le thread dell'assistente hanno limit e cursore
con «Mostra altre» nella lista. Server-Timing su tutte e tre. Benchmark di Allocazione e Dividendi prima/dopo.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Caching, § Server Layer and API Authorization, § Firestore Queries and the Rules,
  § Dynamic Imports: le funzioni con new Date() dentro), CLAUDE.md
- Leggi doc/guide/allocazione.md, cashflow-dividendi.md, assistente.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-10 per intero; PERF-07 deve essere chiusa (il helper Server-Timing esiste)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Chiusura: le tre falsificazioni di § 7 viste ROSSE; diff delle risposte prima/dopo su fixture; curl delle tre route con
la coppia 200/403; benchmark prima/dopo; suite d'area, tsc, lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO;
giro guidato di 4 punti sul mirror, poi mirror:remove; CLAUDE.md «Latest», le tre guide, Draft Release Temp.md (senza
dati privati), doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Due route indipendenti con logica chiara e test facili da falsificare, più un header; la
parte di dominio (ricevuti/annunciati mai in una cifra) è scritta nella guida. Sonnet 5 per (C) da solo; Opus per (B).
