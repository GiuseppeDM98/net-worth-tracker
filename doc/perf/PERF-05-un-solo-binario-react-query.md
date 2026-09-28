# PERF-05 — Un solo binario per i dati: ogni pagina legge dagli stessi hook React Query

> Stato: da fare · Priorità: 1 (prerequisito di PERF-03 e PERF-06) · Sforzo: L · Dipende da: PERF-01 · Sblocca: PERF-03, PERF-06, PERF-09, PERF-11, PERF-13

## 1. Il problema, misurato

Le stesse collezioni vengono lette con meccanismi diversi da pagine diverse, quindi la cache di React Query non dedupla e
ogni pagina riparte dal server. Misura warm (navigazione client, stessa sessione, mirror, 2026-09-26):

| Pagina | primo numero (ms) | richieste Firestore | perché |
|---|---|---|---|
| Analisi, con le spese GIÀ in cache dopo Cashflow | **242** (nessuno skeleton) | 2 | `useExpenses` deduplica |
| Storico | **1250** | 8 | 7 chiamate DIRETTE ai servizi in `Promise.all` (`app/dashboard/history/page.tsx:139-147`), nessuna chiave React Query: rilegge S, A, TUTTA E, T, P e `getSettings` DUE volte (`getTargets` è `getSettings(...).targets`, `assetAllocationService.ts:137-142`) |
| Patrimonio | 314 | **11** | `useAssets` → poi `useMortgageInstalments` (una query per immobile, `expenseService.ts:1425-1428`, `staleTime: 0`), `useAssetLedgerMeta` → poi `useAssetTransactions` (T intera per mostrare un mese, `assets/page.tsx:165-168`), più `AssetDialog` CHIUSO che legge `assetAllocationTargets` al mount (`AssetDialog.tsx:543-547`, montato a `assets/page.tsx:528`) |
| FIRE › Calcolatore | 1757 | 6 | 3 round trip in serie: assets → `getFIREData` (S diretta + E dell'anno scorso) → E dall'11 mesi prima del primo snapshot (`fireService.ts:782-785, 811`); l'anno scorso letto DUE volte (`annualCashflowData` e `getAnnualExpenses`) |
| Cashflow › Centri | — | 1 + N centri | N+1 (`CostCentersTab.tsx:105-116`) su righe già in `allExpenses` |
| Cashflow › Dividendi | — | +1 | `getAllAssets` diretta (`cashflow/page.tsx:144`) accanto a `useAssets` (`:108`) |
| Allocazione, Impostazioni, Analisi, Rendimenti (stadio 1) | — | — | `getSettings`/`getAllAssets` diretti in `useEffect`, fuori chiave |
| ExpenseDialog all'apertura | — | 4 | categorie, A, settings, centri: tutte già in cache sulla pagina (`ExpenseDialog.tsx:1430, 1442`) |

Le righe sono del 2026-09-26: riverificarle prima di toccare. Regole già in AGENTS.md § React Query and Derived State che
questa spec applica fino in fondo: «`forceMount` tabs deriving from a sibling's data MUST use React Query»; «Declare N fixed
hook instances… never loop over hooks»; il modello è Previdenza (`components/pension/PensionOverview.tsx:117-130`: A, P,
settings, S tutte per chiave, zero duplicati).

## 2. Obiettivo misurabile

- Benchmark warm (PERF-01): Storico da 8 a **≤ 3** richieste Firestore e primo numero **< 400 ms** con le collezioni già in
  cache; Patrimonio da 11 a **≤ 4**; FIRE profondità da 3 a **1** round trip; Centri 1 richiesta.
- `grep -rn "getSettings(\|getAllAssets(\|getUserSnapshots(\|getAllExpenses(" app components` restituisce SOLO gli hook
  (`lib/hooks/*`) e i servizi: nessuna pagina o componente chiama un servizio di lettura direttamente.
- Un solo `['settings', ownerId]` in tutto il repo, dentro `useSettings`.
- Tutti i test esistenti verdi e i numeri delle pagine INVARIATI (il refactor non cambia una cifra: metodo «Proving a refactor
  changed no number», doc/guide/e2e-emulatori.md — due dump prima, due dopo, confronto del SET dei valori).

## 3. Non-obiettivi

- Non si restringono le finestre di lettura delle spese (PERF-06): qui `useExpenses` resta l'intera collezione, ma UNA volta.
- Non si tocca il server né Rendimenti stadi 2-5 (PERF-09), né i dialog sempre montati (PERF-11).
- Non si cambia il verdetto o un numero: è un refactor puro con prova di invarianza.

## 4. Design

**Gli hook che mancano** (`lib/hooks/`): `useSettings(ownerId)` su `['settings', ownerId]` (la chiave che `AssetDialog`,
FIRE e Previdenza già usano: portarla in `queryKeys.settings.all(ownerId)`, e portare sulla stessa costante i CINQUE punti
che oggi la invalidano a mano — `settings/page.tsx:1539`, `FireCalculatorTab.tsx:645/661/680`, `MonteCarloTab.tsx:323`,
`useCoastFireSettingsDraft.ts:230`), `usePensionContributions` esiste, `useSnapshots` esiste, `useAssets`/`useExpenses`/
`useExpenseCategories` esistono; `useCostCenters(ownerId)` — ATTENZIONE: la chiave `costCenters.all` ESISTE già con un'altra
forma (`CostCentersTab.tsx:102-116` vi mette `{ centers, byCenter }`): la forma cambia in «i centri e basta», e ogni lettore
del prefisso (`CostCenterDetail`, `ExpenseDialog`) si adegua; `useGoalData(ownerId)`; `useDividendReceipts(ownerId)`;
`useHallOfFame(ownerId)` su `hallOfFame.all` (oggi `useEffect` + `getHallOfFameData`, `hall-of-fame/page.tsx:143,153` — PERF-03
lo vuole persistito). Ogni hook: `enabled: !!ownerId`, nessuno `staleTime` locale (il globale è 5 min), `placeholderData`
mai `initialData` (AGENTS.md).

**Le pagine e i componenti a chiamate dirette** passano agli hook. Storico: `useSnapshots`, `useAssets`, `useSettings`,
`useExpenses`, `useAssetTransactions`, `usePensionContributions` → un `useMemo` che ricompone ciò che oggi fa il
`Promise.all`, e `resolveSurfaceState({ loading: uno qualsiasi isLoading, failed: uno qualsiasi isError })`
(doc/guide/stati.md: «An async view must gate on EVERY query it reads»). Allocazione, Impostazioni, Analisi, Rendimenti
stadio 1, Cashflow (`getSettings` in `useEffect` a `:175-204`, `getAllAssets` a `:144`), Hall of Fame, e i SEI chiamanti
trovati dal grep del 2026-09-26: `components/dividends/DividendDialog.tsx`, `CoastFireTab.tsx`, `GoalBasedInvestingTab.tsx`,
`MonteCarloTab.tsx`, `WhatIfAnalysisTab.tsx`, `PensionOverview.tsx`. Dove la pagina ha un «Aggiorna» che oggi richiama la
funzione, chiama `queryClient.invalidateQueries` sulle chiavi (mai `refetch()` nudo, AGENTS.md § Caching).

**Analisi legge DUE campi delle impostazioni**: `cashflowHistoryStartYear` e, dal 2026-09-27 (#400),
`spendingRolesEnabled`. Entrambi vengono da `useSettings(ownerId)` e il secondo entra nel `loading` della pagina come il
primo: mai un `false` provvisorio, che aprirebbe il Flusso su «Per tipo» e poi lo farebbe saltare a «Per ruolo». Una
lettura fallita resta NON fatale come oggi (il pavimento di default, il Flusso solo «Per tipo»), ma da qui l'`isError`
dell'hook la rende visibile: il blind spot di doc/guide/cashflow-analisi.md si chiude.

**Le mutazioni invalidano le chiavi**: già oggi per asset e spese (`useDeleteAsset`, `useCreateSnapshot`); verificare che ogni
scrittura di impostazioni (`setSettings`, le sette sedi di doc/guide/impostazioni.md § Settings — the FIVE places) invalidi
`settings.all`, e che il salvataggio di un centro invalidi `costCenters.all`. Le scritture di CATEGORIA invalidano già
`queryKeys.expenses.categories(ownerId)`, e le liste delle spese quando cambiano tipo o nome, dal 2026-09-27 (il ruolo
50/30/20 vive sulla categoria e Analisi lo legge da quella chiave): qui passano dalle mutation degli hook, e la pagina
Impostazioni smette di tenere la SUA copia delle categorie (`loadExpenseCategories`) accanto alla chiave.

**I punti singoli:**
- `AssetDialog.tsx:543-547`: `enabled: open && !!ownerId` — o meglio `useSettings` con `enabled: open`.
- `ExpenseDialog.tsx:1430, 1442`: le quattro letture diventano `useExpenseCategories`, `useAssets`, `useSettings`,
  `useCostCenters` (dati già in cache sulla pagina: l'apertura non aspetta nulla). Il reset del form resta com'è
  (§ Dialog Form Reset). `spendingRolesEnabled` (#400) arriva da `useSettings` con gli altri campi e scende a
  `CategoryManagementDialog` per prop, come oggi; i due host che non lo passano (`CategoryDeleteConfirmDialog`,
  `CategoryMoveDialog`) restano così: senza il flag il dialog non mostra né scrive il ruolo, per scelta.
- Esposizione: dal 2026-09-28 la tessera riceve gli asset dalla pagina (`EsposizioneTile.tsx`, prop `assets`) e legge i
  profili da `queryKeys.portfolio.instrumentProfiles` (`lib/hooks/usePortfolioExposure.ts`, la pesatura nel browser);
  quando Allocazione passa a `useAssets`, la tessera prende `assets` da lì e nient'altro cambia: un asset modificato
  ricalcola il motore da sé, e la chiave dei profili cambia solo se cambia un ticker in vista.
- Centri: `groupExpensesByCostCenter(allExpenses)` in `lib/utils/costCenterUtils.ts` (pura, testata) al posto delle N query;
  resta `useCostCenters`. Il conteggio accanto a un'azione distruttiva deve venire dalla STESSA query della mutazione
  (doc/guide/centri-di-costo.md): verificare che la mutazione di eliminazione legga anche lei da `allExpenses` o mantenga la
  sua query dedicata (non è la pagina, è un click: va bene una query lì).
- Mutuo: `useMortgageInstalments` → UNA query `where('debtAssetId', 'in', propertyIds)` (max 30 id; oltre, a blocchi) e
  `staleTime` globale + invalidazione da «Collega la serie» e dal salvataggio di una rata (`queryKeys.assets.all` è già
  la chiave sotto cui vive, doc/guide/patrimonio.md § Mutuo). ATTENZIONE alla regola delle rules: la query deve portare
  `userId` (`allow read: if canAccess(resource.data.userId)`), e «max 3 `.where()`» per il mock (AGENTS.md § Firestore Queries).
- Patrimonio T: resta la lettura intera in questa spec (l'indice `(userId, date)` per T è PERF-06); ma `useAssetTransactions`
  non aspetta più `useAssetLedgerMeta` quando la meta esiste già in cache (oggi profondità 2 per costruzione: `enabled` sulla
  meta). Valutare `enabled: !!ownerId` per entrambe e far decidere alla PAGINA cosa mostrare quando la migrazione manca.
- FIRE: `getFIREData` prende S dalla chiave `snapshots.all` (`queryClient.fetchQuery`) e la E dell'anno scorso UNA volta
  (`annualCashflowData` la fornisce già); la E storica (`:811`) parte in parallelo agli asset, non dopo.
- Cashflow Dividendi: `loadOtherData` (`cashflow/page.tsx:132-162`) usa `queryClient.fetchQuery(assets.all)`.

**Invarianza provata**: prima del refactor, due dump dei valori renderizzati di Storico, Patrimonio, FIRE, Allocazione
(script usa-e-getta Playwright sul mirror che raccoglie ogni `font-mono` / cifra con €), a minuti di distanza (rumore); dopo,
altri due; confronto dei SET. Un numero diverso = il refactor ha cambiato una lettura (o il mirror si è mosso: rileggere).

## 5. File da toccare

- `lib/query/queryKeys.ts` — `settings`, `goals`, `dividendReceipts`, `hallOfFame` (le chiavi nuove).
- `lib/hooks/useSettings.ts`, `useCostCenters.ts`, `useGoalData.ts`, `useDividendReceipts.ts`, `useHallOfFame.ts` — nuovi;
  `useMortgageInstalments.ts`, `useAssetTransactions.ts` — modificati; i cinque punti di invalidazione delle impostazioni.
- `app/dashboard/hall-of-fame/page.tsx`, `components/dividends/DividendDialog.tsx`, `components/fire-simulations/{CoastFireTab,GoalBasedInvestingTab,MonteCarloTab,WhatIfAnalysisTab}.tsx`,
  `components/pension/PensionOverview.tsx` — dagli hook.
- `lib/services/expenseService.ts` — `getMortgageInstalmentsForProperties(ownerId, ids[])` con `in`.
- `lib/utils/costCenterUtils.ts` — `groupExpensesByCostCenter`.
- `app/dashboard/{history,allocation,settings,analisi,performance,cashflow,assets}/page.tsx`, `components/cashflow/{AnalisiTab,CostCentersTab}.tsx`,
  `components/fire-simulations/FireCalculatorTab.tsx` + `lib/services/fireService.ts`, `components/assets/AssetDialog.tsx`,
  `components/expenses/ExpenseDialog.tsx`.
- Test: `__tests__/costCenterUtils.test.ts` (raggruppamento), `__tests__/useMortgageInstalments*.test.ts` o il servizio
  (`in` a blocchi di 30), le suite d'area di ogni pagina toccata (tabella in AGENTS.md § 5).

## 6. Passi

1. Benchmark warm prima + i due dump di invarianza.
2. Hook nuovi + chiavi; `tsc`.
3. Una pagina alla volta, dalla più semplice (Allocazione) alla più intrecciata (Storico, FIRE): dopo ognuna `tsc` e la sua
   suite d'area; il dump di quella pagina.
4. I punti singoli (AssetDialog, ExpenseDialog, Centri, Mutuo).
5. E2E completo; benchmark warm dopo; i due dump finali e il confronto.

## 7. Test e falsificazione

- `groupExpensesByCostCenter`: righe con e senza `costCenterId`, un centro senza righe → `[]`, mai `undefined`.
  Falsificare: una riga con `costCenterId` sconosciuto deve finire in NESSUN centro (rompere il filtro → rosso).
- Query `in` a blocchi: 31 id → 2 query; falsificare la soglia (30 → 31) e vedere rosso.
- «La pagina attende TUTTE le query»: test della funzione che compone lo stato di Storico con una query in errore → `failed`.
- Invarianza: i set di valori prima/dopo identici (script usa-e-getta); un valore diverso blocca la chiusura.
- E2E: tutte le spec delle pagine toccate + `cashflow.mortgage.spec.ts` (le rate collegate), `cashflow.centri.spec.ts`.

## 8. Collaudo guidato

- A: E2E completo + invarianza. C: le tre falsificazioni. D: le rules: la query `in` con `userId` accettata dall'emulatore
  (una lettura senza `userId` → `permission-denied`, visto una volta).
- F (mirror): 1) Storico apre in un colpo, nessuna cifra cambiata rispetto a prima (il proprietario conosce i suoi numeri);
  2) Patrimonio: la tessera Mutuo c'è con gli stessi interessi; 3) Cashflow › Centri: i totali per centro identici;
  4) «Nuova spesa» apre senza attesa; 5) FIRE: il Calcolatore con lo stesso numero FIRE. Non coperto: niente di visivo cambia.
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Il rischio è un numero che cambia perché una lettura diretta faceva una cosa in più (es. `getTargets` normalizzava): il
  confronto dei set lo intercetta; ogni differenza si spiega prima di chiudere.
- `enabled` mal posto → skeleton eterno (`isLoading` vs `isPending` su query disabilitata, AGENTS.md).
- Rollback: per pagina (una pagina = un blocco del diff).

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; AGENTS.md § React Query and Derived State: la regola «una pagina non chiama un servizio di lettura: solo
  hook» con la lista degli hook; doc/guide/storico.md, patrimonio.md (Mutuo: una query `in`), centri-di-costo.md, fire.md,
  cashflow.md (ExpenseDialog dalle chiavi); `Draft Release Temp.md`; doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-05-un-solo-binario-react-query.md: ogni pagina E ogni componente
legge assets, snapshot, spese, categorie, impostazioni, contributi, operazioni, centri, obiettivi e Hall of Fame SOLO
dagli hook React Query (useSettings, useCostCenters, useGoalData, useDividendReceipts, useHallOfFame vanno creati; i
sei chiamanti diretti elencati in § 4 compresi), nessuna chiamata diretta ai servizi di lettura da pagine o componenti;
Centri senza N+1; Mutuo con una query «in»; AssetDialog chiuso non legge; ExpenseDialog apre dalle chiavi; FIRE senza
catena a 3. È un refactor: NESSUN numero deve cambiare, e lo provi con i dump prima/dopo.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ React Query and Derived State, § Firestore Queries and the Rules, § Caching), CLAUDE.md
- Leggi doc/guide/stati.md, storico.md, patrimonio.md, centri-di-costo.md, fire.md, cashflow.md, impostazioni.md
  (§ Settings — the FIVE places), e2e-emulatori.md (§ Proving a refactor changed no number)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-05 per intero; riverifica le righe citate (sono del 2026-09-26)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Metodo: benchmark warm prima (npm run perf:bench -- --warm-only) e due dump di invarianza sul mirror; una pagina alla
volta con tsc + suite d'area dopo ognuna; alla fine benchmark warm dopo, i due dump finali e il confronto dei set. Le
falsificazioni di § 7 viste ROSSE. Chiusura: grep delle chiamate dirette = solo hook e servizi; tsc, lint 0, Vitest in
Europe/Rome, npm run test:e2e COMPLETO; giro guidato di 5 punti sul mirror, poi mirror:remove; CLAUDE.md «Latest»,
AGENTS.md, le guide, Draft Release Temp.md (senza dati privati), doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Sette pagine, dieci hook, e un'invarianza da provare numero per numero: il rischio è
una lettura diretta che faceva qualcosa in più e che un modello meno attento perde. Effort high (non xhigh: le regole sono
scritte, il lavoro è disciplina).
