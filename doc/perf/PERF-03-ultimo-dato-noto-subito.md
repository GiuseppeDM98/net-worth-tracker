# PERF-03 — L'ultimo dato noto subito, il dato fresco appena arriva

> Stato: da fare · Priorità: 2 · Sforzo: M · Dipende da: PERF-02 (la shell c'è già), PERF-05 (le pagine leggono da React Query, o non c'è niente da persistere) · Sblocca: —

## 1. Il problema, misurato

Al reload, o alla riapertura del telefono dopo un'ora, l'app riparte da zero: la cache di React Query vive in memoria (nessun
persister, `lib/providers/QueryClientProvider.tsx`), e la cache persistente di Firestore (`persistentLocalCache`,
`lib/firebase/config.ts:30-34`) **non viene mai consultata a caldo**: zero `onSnapshot`, zero `getDocsFromCache`, zero
`getDocFromCache` in tutto il codice (verificato 2026-09-26); ogni `getDocs` va al server, IndexedDB serve solo offline.

Misura cold (mirror, emulatori a ~1 ms): Cashflow 2110 ms, Storico 2285, FIRE 2040, Analisi 1690 al primo numero. A caldo
(seconda navigazione nella stessa sessione) Analisi con le spese già in cache risponde in 242 ms senza skeleton; ma basta un
reload e si ricomincia. In produzione, su 4G, i 1533 documenti di spese sono ~600 KB di WebChannel prima di vedere qualcosa.

Il post: il composer statico dipinge prima di React; la sessione è prefetchata al hover. L'equivalente per un'app di dati è
**stale-while-revalidate**: dipingere l'ultimo stato noto dalla cache locale pochi millisecondi dopo la shell (il ripristino
da IndexedDB è asincrono: shell → `isRestoring` → dati), poi sostituirlo con il fresco. Il proprietario ha scelto
(2026-09-26): «sì, ovunque, con etichetta onesta».

## 2. Obiettivo misurabile

- Benchmark con `npm run perf:bench -- --revisit` (reload della route dopo una visita): il marcatore `data` su Cashflow, Storico, Analisi,
  Patrimonio, Previdenza, Hall of Fame scende sotto **300 ms** (oggi 510–2285) e lo `skeleton` NON appare quando esiste un
  dato persistito. FIRE: persistita solo `annualCashflowData`; il suo obiettivo resta quello di PERF-05/06.
- Mentre il fresco è in volo, la pagina mostra «Aggiornato alle HH:MM» nel `PageVerdict` (o nel `PageHeader` dove non c'è
  verdetto), e la riga si svuota quando il fresco è arrivato. Verificato in Playwright leggendo il testo che il nodo
  `role="status"` HA AVUTO durante il ripristino (un `MutationObserver` da `addInitScript` che registra ogni testo del nodo:
  sugli emulatori la finestra dura pochi ms, e un `getByText` arriverebbe tardi).
- Il dato persistito non sopravvive a: logout (svuotato), cambio di `ownerId` (chiavi diverse, già oggi), demo mode (mai
  persistito), un `buster` diverso (versione della cache), 24 ore.
- Le spec E2E non ereditano una cache: i sei `auth*.setup.ts` cancellano lo store del persister prima di `storageState`.

## 3. Non-obiettivi

- Nessun `onSnapshot`/realtime: la scelta del repo è query + invalidazione (AGENTS.md § React Query), e resta.
- Non si persiste ciò che non è dell'utente e già ha una cache condivisa lato server (benchmark, FX: `staleTime` 6 h).
- Non si cambia il verdetto (`lib/utils/narrative.ts`): l'etichetta è una riga sotto, non una frase nel verdetto.
- Non si persistono i contesti dell'assistente né le thread (dati che cambiano ad ogni messaggio e pesano).

## 4. Design

**Persister su IndexedDB, non localStorage**: 1533 spese + 45 snapshot con `byAsset` superano i 5 MB di `localStorage`.
Pacchetti: `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` (stessa major 5.x di
`@tanstack/react-query` 5.90 — verificare con `npm view`), storage `idb-keyval` (2 KB) come `AsyncStorage`.
`PersistQueryClientProvider` al posto di `QueryClientProvider` in `lib/providers/QueryClientProvider.tsx`, con:
- `maxAge: 24 h` — e **`gcTime ≥ maxAge` sulle query persistite**: il globale è 10 min (`QueryClientProvider.tsx:35`), e una
  query inattiva raccolta dopo 10 minuti viene TOLTA anche dal persister — «riaprire dopo un'ora» troverebbe il nulla. Gli hook
  della allowlist passano `gcTime: 24 h` (`lib/constants/persistCache.ts` esporta `PERSISTED_GC_TIME_MS`), il globale resta 10 min
  per il resto. PERF-06 lo sa (§ 9).
- `buster: PERSIST_CACHE_VERSION` (una costante in `lib/constants/persistCache.ts`, bumpata quando cambia la forma di un
  payload persistito, come `DASHBOARD_OVERVIEW_SOURCE_VERSION` fa per l'overview);
- `dehydrateOptions.shouldDehydrateQuery`: SOLO le chiavi in una allowlist (`queryKeys.assets.all`, `snapshots.all`,
  `expenses.all` e il prefisso `expenses.range` (PERF-06), `expenses.categories`, `dashboard.overview`, `settings.all`,
  `pensionContributions.all`, `assetTransactions.all`, `costCenters.all`, `hallOfFame.all` (PERF-05 lo porta su React Query),
  `['annualCashflowData', ownerId]`), con `state.status === 'success'` e MAI per l'account demo: la regola è
  `process.env.NEXT_PUBLIC_DEMO_USER_ID === uid` (`lib/hooks/useDemoMode.ts:13-15`), estratta in una funzione pura
  `isDemoUid(uid)` che il hook e il provider usano entrambi;
- `serialize`/`deserialize` che preservano `Date` (le spese hanno `date: Date` dopo `toDate()` nel servizio — AGENTS.md § Firebase
  Dates; e un lettore può ancora consegnare `Timestamp` grezzi, `AGENTS.md:60-62`): un reviver ISO → `Date` su un elenco di
  campi noti per chiave, che accetta anche la forma `{ seconds, nanoseconds }`. Test che un round trip restituisce `Date`.
- Al logout (`useLogout`, `AuthContext.signOut`): `queryClient.clear()` + `persister.removeClient()`.
- Flag `NEXT_PUBLIC_PERSIST_QUERIES`: `'false'` spegne il persister (rollback in un deploy; MAI impostato in `dev:e2e`, la suite
  deve girare con il persister ON e i setup che puliscono lo store).

**Come la pagina sa che sta mostrando il vecchio.** Con il persister, `useQuery` restituisce `data` subito con
`isFetching: true` e `dataUpdatedAt` = l'ora della persistenza. Un hook `useFreshness(queries[])` (`lib/hooks/useFreshness.ts`)
riceve le query della pagina e restituisce `{ stale: boolean, updatedAt: Date | null }` = «almeno una sta rifetchando E il suo
`dataUpdatedAt` è più vecchio di N minuti». Le PAROLE vengono da `lib/utils/statesNarrative.ts` (`describeFreshness({ updatedAt,
now })` → «Aggiornato alle 18:42, sto rileggendo…» / «Aggiornato ieri alle 18:42…»), mai da un componente (The Narrative Honesty
Rule). Il primitivo: una riga `text-[11px] text-muted-foreground` con `role="status"` sotto il `PageVerdict`
(`components/ui/page-verdict.tsx` accetta `freshness?: FreshnessReading`); dove non c'è verdetto (Impostazioni) la riga sta
nel `PageHeader`. Il `role="status"` è UN nodo stabile che cambia testo e si svuota, mai un nodo che appare e sparisce
(la regola dei dialog, doc/guide/dialog.md).

**Ordine con la scena.** La scena di pagina (`useSceneNavigation`) risolve quando `usePathname()` cambia: con il dato
persistito la nuova pagina monta già con le tessere, quindi la transizione anima da tessere a tessere invece che da tessere
a skeleton. È il comportamento voluto.

**Panoramica**: l'overview ha già `freshness.updatedAt` nel payload (`types/dashboardOverview.ts:152-156`); l'etichetta usa
il più vecchio fra `dataUpdatedAt` della query e `freshness.updatedAt` del payload, così anche un riepilogo materializzato
vecchio dice la sua età.

**I test E2E.** `storageState({ indexedDB: true })` (`e2e/auth.setup.ts:33`) porterebbe lo store del persister dentro
`e2e/.auth/*.json` e in OGNI spec: i sei setup cancellano il database di `idb-keyval` (`indexedDB.deleteDatabase(...)`)
dopo il login e PRIMA di `storageState`. Una spec che muta dati vede il fresco per invalidazione; una spec che leggesse un
dato vecchio starebbe segnalando un bug del persister, non del test.

**Cosa NON persistere**: `performance-cache` (già su Firestore), benchmark/FX (cache server),
assistant.*, `budgetHistory` (1 h stale, letture da 6 doc), `fireData` (la chiave porta `currentNetWorth`). L'Esposizione:
fuori dalla allowlist come benchmark e FX, con la chiave che ha oggi (`queryKeys.portfolio.instrumentProfiles(ownerId,
signature)`, `lib/query/queryKeys.ts`; la pesatura nel browser dal 2026-09-28): i profili di Yahoo stanno già dietro una
cache server di 30 giorni.

## 5. File da toccare

- `package.json` — le tre dipendenze.
- `lib/providers/QueryClientProvider.tsx` — `PersistQueryClientProvider`, persister IndexedDB, allowlist, `buster`, il flag.
- `lib/constants/persistCache.ts` — `PERSIST_CACHE_VERSION`, `PERSISTED_GC_TIME_MS`, `PERSISTED_QUERY_PREFIXES`,
  `isPersistableQuery(key)` (pura, testata). `lib/utils/demoAccount.ts` — `isDemoUid`; `lib/hooks/useDemoMode.ts` la usa.
- `lib/utils/queryPersistence.ts` — `serializeForPersist`/`deserializeFromPersist` (Date, Timestamp-shaped), pure, testate.
- Gli hook della allowlist — `gcTime: PERSISTED_GC_TIME_MS`.
- `lib/hooks/useFreshness.ts` — nuovo. `lib/utils/statesNarrative.ts` — `describeFreshness`.
- `components/ui/page-verdict.tsx` — prop `freshness`; `components/layout/PageHeader.tsx` — idem per le pagine senza verdetto.
- Le 11 pagine — passano le loro query a `useFreshness` e la lettura al verdetto (una riga per pagina).
- `lib/hooks/useLogout.ts` / `contexts/AuthContext.tsx` — `clear()` + `removeClient()` al logout.
- `e2e/auth*.setup.ts` (sei) — cancellano lo store prima di `storageState`.
- `scripts/perfBenchmark.mjs` — niente: `--revisit` c'è già (il secondo caricamento della route dopo una prima visita).
- Test: `__tests__/persistCache.test.ts`, `__tests__/queryPersistence.test.ts`, `__tests__/demoAccount.test.ts`,
  `__tests__/statesNarrative.test.ts` (nuovi casi), `e2e/freshness.spec.ts`.

## 6. Passi

1. Verificare PERF-02 e PERF-05 chiuse (README): senza, Storico/Allocazione/Impostazioni non hanno nulla in cache da persistere.
2. Dipendenze, provider, allowlist, `gcTime` sugli hook + test puri (Date round trip; demo mai persistito; chiave fuori
   allowlist esclusa).
3. I sei setup che puliscono lo store; `npm run test:e2e` completo PRIMA di toccare le pagine (il persister cambia il primo
   frame di ogni spec).
4. `useFreshness` + `describeFreshness` + il primitivo nel verdetto; una pagina (Cashflow) per prima.
5. Playwright: visita → reload → nessuno skeleton; il testo del nodo `status` registrato dall'observer contiene «Aggiornato
   alle»; poi si svuota.
6. Le altre pagine; logout svuota (asserzione: dopo logout+login di un ALTRO account fixture, nessun dato dell'altro).
7. Benchmark prima/dopo con `--revisit`.

## 7. Test e falsificazione

- `isPersistableQuery`: `['expenses', uid]` → true; `['assistant','threads',uid]` → false; chiave dell'uid demo → false.
  Falsificazione: togliere il controllo demo e vedere rosso.
- Round trip `Date`: una spesa con `date: Date` → serializzata → deserializzata → `instanceof Date` e stesso istante; una con
  `{ seconds, nanoseconds }` → `Date`.
- `describeFreshness`: stesso giorno / ieri / più vecchio → tre frasi; `updatedAt: null` → nessuna clausola (Narrative Honesty).
- `e2e/freshness.spec.ts` (`desktop`): (a) reload senza skeleton (anchor positivo prima: la prima visita lo mostra —
  «un'asserzione di ASSENZA ha bisogno di un anchor positivo», AGENTS.md § Audit habits); (b) il nodo `status` ha avuto il
  testo «Aggiornato alle» (observer bufferizzato); (c) alla fine il nodo è vuoto. Falsificare (a) con
  `NEXT_PUBLIC_PERSIST_QUERIES=false` sul server della suite (una run apposta) e vedere lo skeleton tornare.
- Cross-account: `cashflow.owner.spec.ts` e le spec dell'account condiviso restano verdi (le chiavi portano `ownerId`).
- Suite: `tsc`, lint 0, Vitest `Europe/Rome`, `npm run test:e2e` completo.

## 8. Collaudo guidato

- A: E2E completo. C: le tre asserzioni di `freshness.spec.ts` viste rosse. E: logout svuota; account condiviso non vede
  il proprietario dopo lo switch (chiavi per `ownerId`).
- F (mirror, `http://localhost:3000/dashboard/cashflow`): 1) reload: il mese è già lì, sotto il verdetto «Aggiornato alle…»
  che si svuota in un attimo; 2) chiudere e riaprire la scheda dopo 15 minuti (oltre il vecchio `gcTime`): idem; 3) aggiungere
  una spesa: la lista si aggiorna e l'etichetta NON compare (dato fresco dall'invalidazione); 4) Impostazioni: la riga
  nell'header; 5) demo (landing → demo): nessuna etichetta mai. Non coperto: la latenza reale del 4G.
- G: `npm run mirror:remove`; IndexedDB del browser del proprietario svuotato dalle DevTools se vuole.

## 9. Rischi e rollback

- Un payload persistito con una forma vecchia dopo un deploy: `buster` è la difesa; ogni spec O PR (anche di un
  contributore) che RINOMINA, TOGLIE o cambia il TIPO di un campo di un payload persistito DEVE bumpare
  `PERSIST_CACHE_VERSION` — regola in AGENTS.md § Caching, accanto a `CACHE_MATH_VERSION`. Un campo nuovo e facoltativo la
  cui assenza vale il default non lo chiede: `ExpenseCategory.spendingRole` e `spendingRolesEnabled` (#400) non possono
  essere letti male da un payload più vecchio, che semplicemente non li ha. Nel dubbio si bumpa: costa una rilettura.
- Un dato vecchio letto come vero: l'etichetta è obbligatoria e la Narrative Honesty Rule la copre; il verdetto NON cambia
  tono per un dato in revalidazione.
- Quota IndexedDB su iOS Safari (~50 MB per origine, spesso meno): il persister scrive con `throttleTime` 1 s e `try/catch`;
  un fallimento di scrittura è silenzioso e l'app resta come oggi.
- `gcTime` 24 h sulle chiavi persistite tiene in memoria più dati inattivi: accettabile (le stesse collezioni che ogni pagina legge).
- Rollback: `NEXT_PUBLIC_PERSIST_QUERIES=false`.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; AGENTS.md § Caching (il persister, la allowlist, `PERSIST_CACHE_VERSION`, `gcTime ≥ maxAge`) e § React
  Query; DESIGN.md NON si rigenera — se la riga di freschezza diventa un primitivo, il proprietario decide la sua voce nel
  documento; doc/guide/stati.md (la quarta lettura: «vecchio ma presente»); doc/guide/e2e-emulatori.md (i setup puliscono lo
  store); doc/guide/account-condiviso-demo.md (`isDemoUid`); `Draft Release Temp.md`; doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-03-ultimo-dato-noto-subito.md: React Query persiste su IndexedDB le
query della allowlist (gcTime 24 h su quelle, buster, mai per l'uid demo, svuotata al logout, flag di spegnimento), le
pagine dipingono l'ultimo dato noto appena il ripristino è fatto e mostrano «Aggiornato alle HH:MM» finché il fresco non
arriva (parole da statesNarrative.ts, un nodo role=status stabile che si svuota); i sei setup Playwright cancellano lo
store prima di storageState.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ React Query and Derived State, § Caching, § Firebase Dates, § Audit habits), CLAUDE.md
- Leggi doc/guide/stati.md, doc/guide/dialog.md (il role=status stabile), doc/guide/account-condiviso-demo.md,
  doc/guide/panoramica.md, doc/guide/e2e-emulatori.md (storageState con indexedDB)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-03 per intero; verifica che PERF-02 e PERF-05 siano chiuse (README), altrimenti
  fermati e dimmelo
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; ogni domanda di prodotto (dove sta
l'etichetta, le sue parole) me la fai con lo strumento interattivo, opzione consigliata per prima.
Chiusura: i test puri (allowlist, demo escluso, round trip Date e Timestamp, describeFreshness) e le tre asserzioni di
e2e/freshness.spec.ts viste ROSSE una volta ciascuna (dimmi come); benchmark prima/dopo con npm run perf:bench -- --revisit;
tsc, lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO con il persister acceso; giro guidato di 5 punti sul mirror,
poi mirror:remove; CLAUDE.md «Latest», AGENTS.md § Caching, le guide stati/e2e-emulatori/account-condiviso-demo,
Draft Release Temp.md (senza dati privati), doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** È la leva più grande sul percepito e la più delicata sull'onestà del dato: serializzazione
delle date, `gcTime` contro `maxAge`, account condiviso, demo, logout, i test che ereditano IndexedDB, la Narrative Honesty
Rule. Il modello più capace, effort xhigh.
