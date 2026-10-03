# PERF-09 — Rendimenti: ogni collezione letta una volta, i rendimenti da dividendo in una chiamata

> Stato: da fare · Priorità: 2 · Sforzo: M · Dipende da: PERF-05 (chiusa il 2026-09-29: gli hook condivisi), PERF-07 (`Server-Timing`) · Sblocca: —

## 1. Il problema, misurato

Rendimenti è la pagina con più traffico dell'app: **17 chiamate API e 10–14 richieste Firestore** a ogni apertura, anche a
caldo (benchmark 2026-09-26: cold 1000–2070 ms, warm 574 ms con tutto in cache tranne ciò che questa pagina non mette in
cache). La catena in `app/dashboard/performance/page.tsx` (verificata):

1. **Stadio 1** (`:354-361`): `Promise.all` di `getUserSnapshots`, `getAllAssets`, `getSettings`, `getPensionContributions`,
   `getDividendReceipts` (TUTTA D, client), `fetchQuery(assetTransactions.all)`.
2. **Stadio 2** (`:372`): `getAllPerformanceData(ownerId)` → `lib/services/performanceService.ts:1487-1493` **rilegge** S,
   settings, A, P, T (T con `getAssetTransactions` diretto, fuori chiave). Cinque collezioni lette due volte, un round trip in più.
3. **Stadio 3**: `readPerformanceCache` (1 `getDoc`, `:1516`); su miss (`:1541`) la E dal primo all'ultimo snapshot.
4. **Stadio 4** (`:375-376`): `fetchYieldMetrics` per 5 periodi → `Promise.all` di **2 route × 5 = 10 chiamate**
   (`/api/performance/yoc`, `/api/performance/current-yield`, `:180-183`), ognuna con `Promise.all(getAllDividends,
   getUserAssetsAdmin, getUserSnapshotsAdmin)` lato server (`yoc/route.ts:65-69`, `current-yield/route.ts:68-72`): **D, A e S
   lette 10 volte sul server**, 10 verifiche del token, e mai in cache — i rendimenti sono aggiunti DOPO `getAllPerformanceData`,
   quindi `performance-cache` non li contiene.
5. In parallelo: 6 `useBenchmarkReturns` + `useFxRates` (`:302-308`) — 7 chiamate con cache server 7 gg: giuste.

Le dieci chiamate partono in parallelo (`Promise.all` sui periodi e dentro `fetchYieldMetrics`), quindi lo stadio 4 costa
~un'ondata (la route più lenta delle dieci: latenza + 3 letture transatlantiche + 10 verifiche token sulla lambda) prima
che il hero (`setPerformanceData` a `:378`) esista — e 30 letture Admin per una cosa che ne vuole 3. Il post: «megamorphic
lookups resolving the same message ID three separate times → resolved once: −78% wall-clock». Qui la stessa collezione è
risolta dodici volte.

**Visto chiudendo la cache persistita (2026-09-29; annotato al ritiro della sua spec, 2026-09-30).** Rendimenti è, con
Impostazioni (PERF-13 § 1), la route che al reload mostra ancora il suo skeleton, e l'unica senza la riga «Aggiornato
alle…» nell'header: lo stadio 1 legge con `queryClient.fetchQuery`, che non ha observer (niente da passare a
`useFreshness`) e, poiché il ripristino invalida ciò che ripristina, ATTENDE la rilettura delle sei collezioni invece di
dipingere quelle restaurate; il hero viene poi da `performance-cache`, che sta su Firestore e fuori dalla allowlist per
scelta. Misura (`perf/README.md` § Revisit): 686 → 685 ms, skeleton sì → sì. Non è un obiettivo di § 2: se questa spec
vuole la regola delle altre pagine — l'ultimo dato noto subito, detto nell'header (doc/guide/stati.md § The fourth
reading) — lo decide il proprietario qui, e il design A (§ 4) è il punto dove entrerebbe.

## 2. Obiettivo misurabile

- Chiamate API al mount: da 17 a **8** (6 benchmark + 1 FX + **1** `/api/performance/yields`); richieste Firestore client:
  da 10–14 a **≤ 7** (S, A, settings, P, D, T, cache — ognuna una volta).
- `Server-Timing: total` della route nuova ≤ quello di UNA delle vecchie (legge D+A+S una volta, calcola 5 periodi).
- I rendimenti (YOC, current yield) NON entrano in `performance-cache`: la sua chiave (`buildCacheKey`, `performanceService.ts:1512`)
  copre snapshot, base, tasso e categoria dividendi, non i dividendi né i prezzi di oggi, da cui YOC e rendimento corrente
  dipendono — metterli lì li renderebbe stantii fino a 6 h (AGENTS.md § Caching: «the key encodes EVERY determining
  input»). Restano in React Query (5 min) sulla chiave `['performance', 'yields', ownerId, hashDeiPeriodi]`.
- `CACHE_MATH_VERSION` resta com'è (`'v8'`, `performanceService.ts:56`): il documento non cambia forma. AGENTS.md § Caching
  dice ancora `v5`: correggerlo a `v8` nello stesso commit.
- Nessun numero cambia: dump prima/dopo dei valori del hero e delle tessere per i 5 periodi (invarianza come PERF-05).
- Benchmark cold Rendimenti: primo numero **< 700 ms** in locale (oggi 1000–2070); in produzione il proprietario lo vede.

## 3. Non-obiettivi

- Non si tocca la matematica (`performanceService`, `performanceBase`, `performanceAttribution`); non si cambia `buildCacheKey`
  se non per il bump; non si tocca la Base né i flussi (doc/guide/rendimenti.md è denso di regole: leggerlo, non riscriverlo).
- Non si sposta il calcolo lato server (le tre sedi della base — servizio, pagina, PDF — restano; § 4 spiega il perché).
- Benchmark e FX restano come sono.

## 4. Design

**A. Un solo giro di letture.** `getAllPerformanceData(ownerId, forceRefresh, inputs?)` accetta gli input già letti
(`{ snapshots, assets, settings, contributions, trades }`) e li usa al posto delle sue cinque letture; la pagina passa lo
stadio 1 (dal 2026-09-29 `loadPerformanceData` in `app/dashboard/performance/page.tsx` legge le sei collezioni con
`queryClient.fetchQuery` sulle `…QueryOptions` esportate dagli hook — `useSnapshots`, `useAssets`, `useSettings`,
`usePensionContributions`, `useAssetTransactions`, `useDividendReceipts` — e le invalida prima su «Aggiorna») e chiama `getAllPerformanceData` in un `useQuery` con chiave
`['performance', ownerId, hashDegliInput]` — o, più semplice e fedele all'oggi, in un `useEffect` che parte quando TUTTE le
query sono `success` (gate su ogni query, doc/guide/stati.md). Il PDF (`pdfDataService.ts`) e ogni altro chiamante che non
passa `inputs` continuano a leggere da soli: il parametro è opzionale e il comportamento senza è identico (test).

**B. Una route per i rendimenti.** `GET /api/performance/yields?userId&periods=[{key,startDate,dividendEndDate,numberOfMonths}]`
(o `POST` con il body, per i 5 periodi in un JSON — `parseOr400` con uno schema zod in `lib/server/validation.ts`, `z.coerce.date()`
per le date, AGENTS.md § Validation). La route: auth → `assertCanAccessAccount` → `Promise.all(getAllDividends,
getUserAssetsAdmin, getUserSnapshotsAdmin)` UNA volta → per ogni periodo le due funzioni pure già usate dalle due route
(estrarle in `lib/utils/dividendYield.ts` se oggi vivono nelle route: la logica delle route va nei moduli puri, § Server Layer)
→ `{ [key]: { yoc, currentYield, … } }`. Le due route vecchie restano un mese (il PDF o l'email le usano? grep prima) e poi
si tolgono; se nessun altro le chiama, si tolgono subito e il test `apiAuthRoutes` si aggiorna.

**C. I rendimenti in React Query, in parallelo.** La chiamata unica parte appena i 5 periodi sono noti — cioè appena
`resolvePerformanceBase` ha dato le date (stadio 1), NON dopo `getAllPerformanceData`: `useQuery` con chiave
`['performance', 'yields', ownerId, hash(periodi)]`, `staleTime` globale, in volo INSIEME al `getDoc` della cache. Il hero
attende entrambi (gate su ogni query, doc/guide/stati.md). «Aggiorna» invalida anche questa chiave.

**D. Profondità finale**: hook (1 round trip, tutte in parallelo) → `getAllPerformanceData(inputs)` (cache: 1 `getDoc`; miss:
+E) e la route dei rendimenti, in parallelo → risposta. Da 4–5 a **2** round trip.

## 5. File da toccare

- `app/dashboard/performance/page.tsx` — stadio 1 dagli hook, `inputs` a `getAllPerformanceData`, `fetchYieldMetrics` → una
  chiamata; il gate su ogni query.
- `lib/services/performanceService.ts` — `inputs?`. `AGENTS.md` § Caching — `v5` → `v8`.
- `app/api/performance/yields/route.ts` — nuova; `lib/utils/dividendYield.ts` — le due funzioni pure; `lib/server/validation.ts`
  — lo schema; le due route vecchie rimosse se orfane.
- `lib/hooks/useDividendReceipts.ts` (esiste dal 2026-09-29, con `dividendReceiptsQueryOptions`).
- Test: `__tests__/performanceService.test.ts` (con e senza `inputs` → stesso risultato),
  `__tests__/dividendYield.test.ts` (i valori delle due route vecchie riprodotti a parità di input: prendere gli attesi dai
  test esistenti delle route), `__tests__/apiAuthRoutes.test.ts` (la route nuova: auth, 400 su body malformato, ownership),
  `e2e/performance.degraded.spec.ts` (resta verde: legge `performance-cache/{uid}`).

## 6. Passi

1. Benchmark cold+warm su `/dashboard/performance` prima; dump dei valori per i 5 periodi (script usa-e-getta sul mirror,
   «Aggiorna» premuto prima per una cache fresca — doc/guide/rendimenti.md).
2. `dividendYield.ts` + test (attesi dalle route vecchie); route nuova + test; `apiAuthRoutes`.
3. `inputs?` + test di equivalenza; la pagina sugli hook; gate.
4. La chiamata unica in React Query, in parallelo alla cache; «Aggiorna» la invalida; `e2e/performance.degraded.spec.ts`.
5. Benchmark dopo; dump dopo; confronto; le route orfane via; AGENTS.md `v8`.

## 7. Test e falsificazione

- Equivalenza `inputs`: stesso `PerformanceData` con e senza; falsificare passando `assets: []` negli inputs e vedere rosso.
- Route nuova: 5 periodi in un body → 5 risultati identici a 5 chiamate delle route vecchie (fixture in memoria dell'Admin
  Firestore, come `__tests__/serverCashSettlement.test.ts`); falsificare invertendo `startDate` e vedere rosso.
- Parallelismo: la chiamata dei rendimenti parte PRIMA che `getAllPerformanceData` risolva (test del hook con un
  `getAllPerformanceData` che non risolve mai: la route è comunque stata chiamata; falsificare mettendola dopo → rosso).
- E2E: `performance.degraded.spec.ts` + una spec che conta le chiamate `/api/performance/*` al mount (= 1) con anchor
  positivo (la chiamata c'è).
- Invarianza dei valori; suite area Rendimenti (doc/guide/rendimenti.md § Files).

## 8. Collaudo guidato

- A: suite Rendimenti + E2E. C: le tre falsificazioni. D: la route con `curl` (body valido → 200; malformato → 400; altro
  utente → 403 con il proprio documento come controllo positivo).
- F (mirror, `http://localhost:3000/dashboard/performance`): 1) il hero e i 5 periodi con gli stessi numeri di prima (il
  proprietario li conosce); 2) YOC e Rendimento corrente per periodo identici; 3) «Aggiorna» ricalcola e la pagina non
  lampeggia; 4) il periodo personalizzato funziona; 5) il PDF di Rendimenti (renderizzato) porta gli stessi numeri. Non
  coperto: la latenza vera (produzione: `Server-Timing`).
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Una route vecchia usata da un chiamante non trovato dal grep (email? PDF?): tenerle un mese è la rete.
- Rollback: per parte (A, B, C sono blocchi indipendenti nel diff).

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; doc/guide/rendimenti.md (gli input passati, la route unica, i rendimenti in React Query e perché non
  in `performance-cache`); AGENTS.md § Caching (`CACHE_MATH_VERSION` è `v8`); `Draft Release Temp.md`; doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-09-rendimenti-una-lettura.md: Rendimenti legge ogni collezione UNA
volta (gli input dagli hook React Query passati a getAllPerformanceData), i rendimenti da dividendo dei 5 periodi arrivano
da UNA route nuova /api/performance/yields che legge D, A e S una sola volta, chiamata in PARALLELO alla lettura della
performance-cache e tenuta in React Query (NON in performance-cache: la sua chiave non copre dividendi e prezzi).
Da 17 chiamate API a 8, da 4-5 round trip a 2. Nessun numero cambia: lo provi con i dump.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Caching, § Server Layer and API Authorization, § React Query, § Audit habits), CLAUDE.md
- Leggi doc/guide/rendimenti.md PER INTERO (è la guida più densa di regole), doc/guide/stati.md, doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-09 per intero; PERF-05 è chiusa (2026-09-29), PERF-07 anche (2026-10-03: l'helper Server-Timing è lib/server/serverTiming.ts)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Metodo: benchmark prima/dopo su /dashboard/performance (cold e warm) e dump dei valori dei 5 periodi con «Aggiorna»
premuto prima; le tre falsificazioni di § 7 viste ROSSE; la route nuova provata con curl (200/400/403 con il controllo
positivo); grep dei chiamanti delle due route vecchie prima di toglierle. Chiusura: suite area Rendimenti, tsc, lint 0,
Vitest in Europe/Rome, npm run test:e2e COMPLETO; giro guidato di 5 punti sul mirror con il PDF renderizzato, poi
mirror:remove; CLAUDE.md «Latest», doc/guide/rendimenti.md, AGENTS.md § Caching (v8), Draft Release Temp.md (senza dati
privati), doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** Rendimenti è la pagina con più regole di dominio del repo (base, flussi, cache con
hash, tre sedi): il refactor deve lasciare identico ogni numero mentre riorganizza le letture. Il modello più capace,
effort xhigh.
