# Persisted query cache

> **When to open this guide** — anyone touching `lib/constants/persistCache.ts` (`PERSISTED_QUERY_PREFIXES`, `PERSIST_CACHE_VERSION`, the retention, the throttle, the rollback flag), `lib/query/queryPersister.ts`, `lib/query/persistedQueryDefaults.ts` (`applyPersistedQueryDefaults`), `lib/providers/QueryClientProvider.tsx` (`SignOutCacheGuard`, the restore's invalidation), `lib/utils/queryPersistence.ts` (dates across the store), `lib/utils/demoAccount.ts` (`isDemoUid`), `lib/query/queryKeys.ts` (the owner's uid right after a persisted prefix), a read hook in `lib/hooks/`, `ProtectedRoute` (`useIsRestoring()`) or `useFreshness` — or anyone who renames, removes or retypes a field of a persisted payload. `AGENTS.md` keeps the stub in § Caching; here is the full rule. Files: § *Files* below. What the reader sees («Aggiornato alle…») is `doc/guide/stati.md § The fourth reading`. Exercised by `e2e/freshness.spec.ts`, `__tests__/persistCache.test.ts`, `__tests__/persistedQueryDefaults.test.ts`, `__tests__/queryPersistence.test.ts` and `__tests__/freshness.test.ts`.

## Files

Moved here from `AGENTS.md` § Caching on 2026-09-30.

- **The persister**: `lib/constants/persistCache.ts` (`PERSISTED_QUERY_PREFIXES`, `PERSIST_CACHE_VERSION`, `PERSIST_CACHE_MAX_AGE_MS`, `PERSIST_CACHE_THROTTLE_MS`, `isQueryPersistenceEnabled` = the rollback flag, `isPersistableQuery`), `lib/query/queryPersister.ts` (`createQueryPersister`, `clearPersistedQueries`), `lib/query/persistedQueryDefaults.ts` (`applyPersistedQueryDefaults`), `lib/providers/QueryClientProvider.tsx` (`SignOutCacheGuard`, the `onSuccess` invalidation, the plain-provider branch), `lib/utils/queryPersistence.ts` (`serializeForPersist`, `deserializeFromPersist`), `lib/query/queryKeys.ts` (the warning on the owner's uid)
- **The demo**: `lib/utils/demoAccount.ts` (`isDemoUid`), read by `lib/hooks/useDemoMode.ts` and by `isPersistableQuery` — doc/guide/account-condiviso-demo.md
- **The restore gate**: `components/ProtectedRoute.tsx` (`useIsRestoring()`)
- **The freshness reading**: `lib/hooks/useFreshness.ts`, `lib/utils/freshness.ts` (`resolveFreshness`, the «old» rule), `describeFreshness` in `lib/utils/statesNarrative.ts` — doc/guide/stati.md
- **Tests**: `__tests__/persistCache.test.ts`, `__tests__/persistedQueryDefaults.test.ts`, `__tests__/queryPersistence.test.ts`, `__tests__/freshness.test.ts`; `e2e/freshness.spec.ts` (Cashflow) and the reload test of `e2e/performance.degraded.spec.ts` (Rendimenti), over `e2e/freshnessProbe.ts` (a helper: what a load showed, what is on disk), and `e2e/persistedCache.ts` (a helper, not a spec: it strips the persisted database from the parked sessions)

## The React Query cache is persisted to IndexedDB and restored before the first fetch

(2026-09-29: `lib/constants/persistCache.ts`, `lib/query/queryPersister.ts`, `lib/providers/QueryClientProvider.tsx`).

### What is persisted, and what is out by design

- ONLY the keys of `PERSISTED_QUERY_PREFIXES` — the thirteen owner collections read through the hooks of
  AGENTS.md § React Query and Derived State, plus the ledger's meta document Patrimonio gates its trades on — only
  successful reads, and NEVER the demo uid (`isDemoUid`, `lib/utils/demoAccount.ts`, the ONE rule `useDemoMode` reads
  too); out by design: the assistant, benchmarks/FX/ECB, the Esposizione's profiles, the budget history. Since
  2026-10-04 also Rendimenti's two COMPUTED payloads, `['performance', 'data', uid, cacheKey]` and
  `['performance', 'yields', uid, windows]` (the owner's decision): the metrics also live in `performance-cache/{uid}`,
  but that is a round trip, and with only the collections restored the reload painted a skeleton under «Aggiornato
  alle…». The metrics are named by the cache key of the inputs they were computed from, so restored inputs and
  restored metrics are one consistent pair; a new cache key leaves the old entry on disk until its 24 hours pass.
  Measured on the mirror (2026-10-04, one visit to Rendimenti): the metrics are ~40 KB and the yields ~3 KB of a
  136 KB record whose snapshots are 55.

- **The daily archive** (2026-11-23): `['daily-snapshots']` is persisted, one query per month. A month copy fetched on
  an Italian day after the month's last is FINAL (`isDailyMonthFinal`, `lib/utils/dailySnapshot.ts`) and takes
  `staleTime: Infinity`; the month in course, and a past month whose copy was fetched while it was still open, take the
  global five minutes. A restored query keeps its `dataUpdatedAt`, which is what the rule reads: a copy taken on the
  20th is read again after the month closes, a copy taken after it never is — within the 24 hours of `maxAge`. A new
  prefix renames nothing, so no `PERSIST_CACHE_VERSION` bump.

### Retention: `maxAge` and `gcTime`

- `maxAge` 24 h, and the same 24 h as `gcTime` set PER PREFIX by `applyPersistedQueryDefaults` — the global ten
  minutes would drop an inactive query from the next save, and «riaprire dopo un'ora» would restore nothing; a hook
  never sets its own.

### The `PERSIST_CACHE_VERSION` bump rule

- **Bump `PERSIST_CACHE_VERSION` (the `buster`) on any change that RENAMES, REMOVES or retypes a field of a persisted
  payload** — everything under `PERSISTED_QUERY_PREFIXES`: an asset (the mortgage instalments under its key too), an
  expense, a snapshot, a category, the settings document, a contribution, a trade, the ledger's meta document, a cost
  centre, the Hall of Fame rankings, a goal, a receipt, an accumulation plan (`accumulation-plans`, persisted since 2026-11-17 so the Piano's note is on a
  warm load's first paint), the overview, Rendimenti's `PerformanceData` and its yields —
  or a client restores the old shape and reads it
  as truth until the refetch lands; a new optional field whose absence means the default does not need it.

### Dates by value

- Dates cross the store by VALUE (`lib/utils/queryPersistence.ts`: `Date`, a `Timestamp` and a bare
  `{ seconds, nanoseconds }` become one tagged ISO and come back a `Date`), never through a list of date fields per
  key.

### The three traps

Three traps, each paid for on 2026-09-29:

- during the restore every query is `pending` and NOT fetching, so `isLoading` is false and `data` undefined —
  `ProtectedRoute` holds the pages on the auth fallback until `useIsRestoring()` is false, and a surface mounted
  outside it must gate on that hook itself;
- the cache is forgotten at sign-out by the PROVIDER on the user→null transition (`SignOutCacheGuard`), never in the
  sign-out handler — a `clear()` under still-mounted hooks is rebuilt, refetched with the outgoing session and back on
  disk a second later (five keys, measured);
- and the persister writes on a one-second throttle whose FIRST call is immediate, so the record on disk can hold the
  settings alone while the expenses are still a second away (`e2e/freshness.spec.ts` polls for the key it needs).

### Rollback flag

- Rollback: `NEXT_PUBLIC_PERSIST_QUERIES=false` (never set on the Playwright server); the flag and the plain-provider
  branch stay until the release that carries the persister has run in production.

### Every load rereads what it restored

- **The restore INVALIDATES what it restored** (`onSuccess`, `refetchType: 'none'`): every load rereads,
  stale-while-revalidate — without it a reload within `staleTime` painted the restored figures and read nothing for
  five minutes (an Admin write between two `goto` stayed invisible to four specs).
- **No write starts from a row of a restored copy still being reread** (2026-11-26; Movimenti alone since
  2026-11-24). The copy may predate the last save — another device's, a co-owner's, this browser's own last second
  (the persister writes at most once a second) — and what starts from it goes wrong in four ways: a dialog keeps the
  old values and saves them over the newer ones (an expense, an asset, a cost centre, a category: last writer wins);
  FIRE › Obiettivi rewrites its WHOLE document from the list in memory, erasing a goal saved elsewhere; a pointer on
  the row names a document that is gone (the fee of a transfer, doc/guide/cashflow.md); a write that carries a
  version is refused (409, doc/guide/registro-operazioni.md § Concurrency). So every control that writes from a row
  is `disabled` exactly while the header says «Aggiornato alle…, sto rileggendo…»: the SAME reading,
  `resolveFreshness(...).stale` with `openedAt`, never `isFetching` alone — a refetch of a list read in this load (the
  invalidation after a save) holds nothing. ONE place, `components/ui/row-actions-hold.tsx`: the area that owns the
  queries mounts `<RowActionsHold queries={[…]}>` (or hands it the reading it took with `useRestoredCopyReread`), and a
  control anywhere below — a row, a tile, a dialog: a portal keeps React's tree — adds `useRowActionsHeld()` to its
  `disabled`. Mounted on Patrimonio (the assets), Cashflow (the window of expenses; Centri di Costo adds the centres
  and the whole expenses), Previdenza (the contributions), FIRE › Obiettivi (the goals: «Nuovo obiettivo» too),
  Allocazione › Accumulo (the plans), Hall of Fame and Storico (a note's «Modifica», the snapshot note's «Salva»),
  Impostazioni › Spese (the categories). Not held, on purpose: a control that writes nothing («Ignora», «Annulla», a
  link to the path, which rereads on mount), a create form that reads no row, and Impostazioni's draft, which is
  reseeded by a fresher read while no tab is dirty. **A new control that edits or deletes a row of a persisted list
  reads `useRowActionsHeld()`**; a new persisted list with such rows mounts the provider. Held by
  `__tests__/rowActionsHold.test.tsx` (the rule, and the controls a test mounts alone), a case in
  `strumentiTile.test.tsx` and `questoMeseTile.test.tsx`, `assetMovementsDialogReread.test.tsx`, and in the browser
  by `e2e/cashflow.reread-hold.spec.ts`, which holds Firestore's channel behind a gate.

### The freshness reading

- The reader is told when a figure from BEFORE this load is being reread — «Aggiornato alle 18:42, sto rileggendo…»
  in the page header, `useFreshness` + `describeFreshness`, «old» being `dataUpdatedAt < performance.timeOrigin` or
  older than the query's own `staleTime` — doc/guide/stati.md § The fourth reading.

## Per-page blind spots

- **Every window of the expenses is a payload of its own in the ONE record** (2026-09-30): after a tour of
  Tracciamento, Budget, Divisione, FIRE and Storico on the owner's mirror the record held six `expenses.*` keys and
  close to three times the rows and the megabytes of the whole collection held once before the windows, and the auth wait that
  contains the restore rose on every page — measured on the Panoramica. The rows are the same rows several times:
  a window is a slice of the collection, not new data. Counting the keys of that record after a tour is part of
  giving a page a window (`doc/guide/cashflow.md § Expenses by window`); merging the slices into one list is not
  written. The deferred items of the persister's retirement review (one persisted record holding every key, the demo never seen in a browser) are in `doc/guide/velocita.md` § Revisit and `doc/guide/account-condiviso-demo.md` § Per-page blind spots.
