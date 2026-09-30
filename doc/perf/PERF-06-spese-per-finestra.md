# PERF-06 — Le spese per finestra: leggere il mese, non la storia

> Stato: da fare · Priorità: 2 · Sforzo: L · Dipende da: PERF-05 (chiusa il 2026-09-29) · Sblocca: —

## 1. Il problema, misurato

`getAllExpenses` (`lib/services/expenseService.ts:71-80`: `where userId`, `orderBy date desc`, nessun `limit`) legge tutta la
collezione — sul mirror 1533 documenti — per Tracciamento (che mostra UN mese più 12 di storico), Analisi, Budget (il mese
corrente, sei mesi di storia e l'anno), Storico, FIRE (l'anno scorso, due volte), Hall of Fame (al ricalcolo). Con Firestore
emulato a ~1 ms:

| Pagina | cold (ms) | warm senza cache (ms) | long task (ms) |
|---|---|---|---|
| Cashflow › Tracciamento | 2110 | 1226 | 400 / 124 |
| Analisi | 1690 (242 con E in cache) | — | 565 / 153 |
| Storico | 2285 | 1250 | 670 / 255 |
| FIRE | 2040 | 1757 | 300 / 75 |

La rete non spiega quei tempi: è il client SDK di Firestore che deserializza 1533 documenti sul main thread (~0,5–1 ms l'uno)
più le riduzioni in memoria. In produzione, sul telefono e su 4G, si sommano i ~600 KB del WebChannel e una CPU 3–5× più
lenta. Ogni anno di spese aggiunge ~300 documenti: il problema cresce da solo.

Gli indici ci sono già: `firestore.indexes.json` ha `expenses (userId, date DESC)`, `(userId, date ASC)` e
`(userId, costCenterId, date)`; `getExpensesByDateRange` esiste (`fireService.ts:929`, `performanceService.ts:1541`). Manca
solo la disciplina di usarlo per pagina. Il prezzo: Tracciamento e Analisi non condividono più la stessa voce di cache
(finestre diverse) — ognuna legge un quarto dei documenti, e la misura di chiusura è il cold.

**Ereditato dalla cache persistita (in develop dal 2026-09-30; annotato al ritiro di PERF-03).** Al reload le pagine
dipingono l'ultimo dato noto da IndexedDB e rileggono dietro (AGENTS.md § Caching), quindi ciò che il proprietario sente
al reload non è più il cold della tabella ma il RIPRISTINO, che sta dentro l'attesa dell'auth: `auth` 115 → 179 ms su
Cashflow e 161 → 385 su Storico, l'unica route rimasta sopra i 300 ms al primo numero (`perf/README.md` § Revisit). Due
fatti che questa spec eredita: il record persistito è UNO e contiene ogni chiave letta nelle ultime 24 ore, quindi la
lista intera di `expenses.all` pesa sul ripristino di QUALSIASI route finché resta nel record; e Storico continua a
volerla tutta (§ 3), quindi le finestre accorciano il record di chi non apre Storico, non il suo. Chi implementa
rimisura anche `npm run perf:bench -- --revisit`: è lì che l'effetto di questa spec sul reload si vede.

## 2. Obiettivo misurabile

- Benchmark cold (PERF-01): Tracciamento **< 900 ms** al primo numero (oggi 2110), Analisi **< 900** (1690), FIRE **< 1000**
  (2040); documenti letti per Tracciamento ≤ 13 mesi di righe (nel mirror ~350 invece di 1533), contati dal log di richieste.
- Storico legge tutto UNA volta (`useExpenses`) e nessun'altra pagina la usa se non per esigenza dichiarata.
- Nessun numero cambia: invarianza come per PERF-05 (dump prima/dopo dei set di valori su Tracciamento, Analisi, Budget, FIRE;
  il metodo e l'orologio fissato in doc/guide/e2e-emulatori.md § Proving a refactor changed no number),
  con attenzione ai bordi: la riga del 31 dicembre in calendario (`e2e/cashflow.split.spec.ts`), il primo del mese, le
  ricorrenze future oltre la finestra.

## 3. Non-obiettivi

- Storico e il Driver (`growthDrivers.ts`), Centri (lifetime, doc/guide/centri-di-costo.md) e Hall of Fame vogliono tutta la
  storia: restano su `useExpenses` intera.
- Non si introducono aggregazioni server (`getAggregateFromServer`): la pagina ha bisogno delle righe, non solo dei totali.
- Non si cambia la semantica di nessun periodo (Da inizio anno ≠ Anno corrente, doc/guide/cashflow-tracciamento.md).

## 4. Design

**I bordi sono la mezzanotte LOCALE, non UTC.** Le spese sono salvate a mezzanotte locale: `ExpenseDialog.tsx:598` fa
`new Date(dateString + 'T00:00:00')` (senza `Z`), e `endOfMonthBound` (`lib/utils/dateHelpers.ts`) è locale. Una finestra da
`2025-09-01T00:00Z` perderebbe OGNI riga del 1° settembre (che sta a 22:00Z del 31 agosto). Quindi: inizio = `new Date(y, m-1, 1)`
(locale) e fine = `endOfMonthBound(y, m)` — gli stessi bordi che il resto dell'app usa per un mese (AGENTS.md § Firebase
Dates). Le fixture dei test si costruiscono COME LA FORM (`new Date('2026-09-01T00:00:00')`), non a UTC mezzanotte; una a
mezzogiorno; una al 31/12.

**Una chiave per finestra**: `queryKeys.expenses.range(ownerId, fromIso, toIso)` = `['expenses', ownerId, 'range', from, to]`,
sotto il prefisso `expenses.all` (la stessa convenzione di `snapshots.range`), e un hook `useExpensesInRange(ownerId, range)`
che chiama `getExpensesByDateRange`. Le finestre sono FUNZIONI PURE testate in `lib/utils/expenseWindows.ts`:
- Tracciamento: `trackingWindow(period)` = dal primo giorno del mese 12 mesi prima dell'inizio del periodo alla FINE del
  periodo — copre il periodo, il confronto con lo stesso periodo precedente e la sparkline a 12 mesi
  (`ExpenseTrackingTab.tsx:130`), più le righe FUTURE del periodo (le ricorrenze «in calendario» sono righe datate,
  doc/guide/cashflow.md: la finestra le include per costruzione).
- Analisi: `analisiWindow(mode, year, cashflowHistoryStartYear)`: `ytd`/`current`/`year` → l'anno e il precedente (il pacing
  confronta anno vs anno−1, doc/guide/cashflow-analisi.md); `history` → da `cashflowHistoryStartYear` (già il pavimento del
  PDF: riusare `pdfTimeFilters.ts` se ha la regola) a oggi. Quando la modalità cambia, cambia la chiave: la seconda finestra
  è una lettura nuova, la prima resta in cache.
- Budget: `budgetWindow(now)` = dal più vecchio fra l'inizio dell'anno e sei mesi prima (`trailingMonthKeys(now, 6)`,
  doc/guide/cashflow-budget.md: da gennaio a maggio la storia di sei mesi entra nell'anno precedente) alla fine del mese.
- FIRE: dal 2026-09-29 il Calcolatore, Coast e What If non leggono più un range proprio — `computeAnnualCashflowData`,
  `computeLastYearExpenses` e `buildFIREData` (`fireService.ts`) filtrano in memoria la lista di `useExpenses`
  (`selectExpensesBetween`: l'anno scorso con il fallback all'anno corrente; la E storica da 11 mesi prima del primo
  snapshot). Qui la loro lista diventa una chiave `expenses.range` di FIRE (dall'inizio dell'anno scorso o da 11 mesi
  prima del primo snapshot, la più vecchia delle due, a oggi) data agli stessi gemelli puri: le funzioni non cambiano,
  cambia cosa ricevono. `getAnnualExpenses` resta il lettore a range del PDF.
- Divisione legge dalla finestra di Tracciamento (è sul suo asse). Centri legge `useExpenses` intera: un centro è lifetime.
- Hall of Fame ricalcolo: intera, com'è (un click, non un mount).

**Le mutazioni invalidano per prefisso**: `queryKeys.expenses.all(ownerId)` è prefisso di `range`. Verificare che OGNI
scrittura di spesa (dialog, import CSV, undo batch, transfer, rata; il cron non c'entra) invalidi il prefisso (AGENTS.md:
«invalidate unconditionally on expense save/delete»).

**Cosa NON rompere**: `isScheduledRow` (righe future nel periodo: la finestra le include); la riga del 31/12 «in calendario
tutto l'anno»; `currentComparisonWindow`/`previousComparisonWindow` (stessi giorni del mese precedente: dentro i 12 mesi);
`filteredExpenses` per la lista Movimenti (`ExpenseTrackingTab`): la lista mostra righe del periodo, non della storia
(doc/guide/cashflow-tracciamento.md). Se un componente di Tracciamento oggi legge fuori dal periodo (grep `allExpenses` nella
tab), la finestra lo dichiara nel test.

## 5. File da toccare

- `lib/query/queryKeys.ts` — `expenses.range`, con il uid SUBITO dopo il prefisso (`['expenses', uid, 'range', …]`): sotto
  un prefisso persistito quel segmento è letto come proprietario (`resolvePersistedOwner`, `lib/constants/persistCache.ts`),
  e il costruttore nuovo si dichiara in `__tests__/persistCache.test.ts` (`OWNER_KEYED_BUILDERS`). `lib/hooks/useExpenses.ts`
  — `useExpensesInRange`, SENZA `gcTime`: la chiave è già persistita e tenuta 24 h per prefisso
  (`applyPersistedQueryDefaults`, AGENTS.md § Caching).
- `lib/utils/expenseWindows.ts` — nuovo, puro: `trackingWindow`, `analisiWindow`, `budgetWindow`, `fireWindows`.
- `lib/services/expenseService.ts` — `getExpensesByDateRange` con `userId` + bordi (esiste? riusare).
- `app/dashboard/cashflow/page.tsx`, `components/cashflow/{ExpenseTrackingTab,AnalisiTab,BudgetTab,ExpenseSplitTab}.tsx`,
  `components/fire-simulations/*`, `lib/services/fireService.ts`.
- Test: `__tests__/expenseWindows.test.ts` (bordi, DST, `Europe/Rome` e macchina), le suite d'area (`tracciamentoSummary`,
  `analisiSummary`, `budgetUtils`, `fireService`), `e2e/cashflow.tracciamento.spec.ts`, `analisi.spec.ts`, `cashflow.split.spec.ts`.

## 6. Passi

1. Benchmark cold prima + dump di invarianza (Tracciamento nei 4 periodi, Analisi nelle 4 modalità, Budget, FIRE).
2. `expenseWindows.ts` + test (fixture costruite come la form; una a mezzogiorno; una al 31/12; il 1° del mese).
3. Hook + chiave; Tracciamento per prima; dump; poi Analisi, Budget, FIRE.
4. Invalidazioni per prefisso: grep di ogni `invalidateQueries` su `expenses` e ogni scrittura.
5. E2E completo; benchmark dopo; dump finali.

## 7. Test e falsificazione

- `trackingWindow`: il periodo «settembre 2026» → from = `new Date(2025, 8, 1)` (locale), to = `endOfMonthBound(2026, 9)`; una
  spesa del 1° settembre 2025 costruita come la form dentro; una del 30/09/2026 alle 23:59 locali dentro; il 1° ottobre 2026
  fuori. Falsificare: usare `Date.UTC(y, m, 1)` per l'inizio e vedere il 1° settembre uscire dalla finestra in
  `TZ=Europe/Rome` (rosso).
- `analisiWindow('history')` parte da `cashflowHistoryStartYear`; con l'impostazione assente parte dal primo anno di dati (o
  come oggi fa il PDF: leggere `pdfTimeFilters.ts` e riusare).
- `budgetWindow` a marzo → parte da settembre dell'anno prima (sei mesi), a ottobre → parte da gennaio (l'anno); falsificare
  togliendo il `min` → marzo perde tre mesi di storia (rosso su `budgetUtils`).
- Invalidazione: test che una chiave `range` è sotto il prefisso `all`.
- E2E: aggiungere una spesa datata fuori dalla finestra corrente (l'anno prossimo) e poi cambiare periodo: appare — prova che
  la seconda finestra legge davvero (anchor positivo) e che l'invalidazione per prefisso ha colpito.
- Invarianza dei set; suite complete nei due fusi.

## 8. Collaudo guidato

- A: E2E completo + invarianza. C: le falsificazioni. D: la query con bordi passa le rules (`userId` presente).
- F (mirror): 1) Tracciamento apre il mese in meno di un secondo; 2) cambio periodo a «Anno corrente» e «Da inizio anno»:
  cifre identiche a prima; 3) Analisi › Storico: la storia c'è tutta; 4) Budget: i tetti annuali con lo speso da gennaio e la
  storia di sei mesi; 5) FIRE: lo stesso numero. Non coperto: 4G reale.
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Il rischio è una riga ai bordi persa (una ricorrenza futura, il 31/12, il 1° del mese a UTC): i test dei bordi nei due fusi
  e la spec Divisione lo pinnano.
- Più chiavi = più cache. Dal 2026-09-29 le chiavi sotto `['expenses']` hanno `gcTime` 24 h per prefisso e il persister le
  tiene fino a `maxAge` (AGENTS.md § Caching) — è il comportamento voluto: la finestra del mese è ciò che si vuole subito
  al reload. Ma ogni finestra letta è un payload in più nell'UNICO record persistito, che si ripristina intero a ogni
  caricamento (§ 1): contare le chiavi `expenses.*` che restano nel record dopo un giro di pagine.
- Rollback: `useExpensesInRange` può restituire `useExpenses` intera dietro un flag di emergenza per un giorno.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; AGENTS.md § React Query: «le spese si leggono per finestra, `expenseWindows.ts` è l'UNICA sorgente, i
  bordi sono la mezzanotte locale»; doc/guide/cashflow.md (la regola e le finestre per tab), cashflow-tracciamento.md,
  cashflow-analisi.md, cashflow-budget.md, fire.md, centri-di-costo.md (lifetime dichiarato); `Draft Release Temp.md`;
  doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-06-spese-per-finestra.md: Tracciamento, Analisi, Budget e FIRE
leggono le spese per FINESTRA (useExpensesInRange su una chiave sotto il prefisso expenses.all), con le finestre come
funzioni pure in lib/utils/expenseWindows.ts e i bordi a MEZZANOTTE LOCALE come le salva la form; Storico, Centri e Hall
of Fame restano sull'intera collezione, dichiarato. Nessun numero cambia: lo provi con i dump prima/dopo e con i test dei
bordi nei due fusi.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Firebase Dates and Timezone, § React Query, § Firestore Queries and the Rules), CLAUDE.md
- Leggi doc/guide/cashflow.md, cashflow-tracciamento.md, cashflow-analisi.md, cashflow-budget.md, cashflow-divisione.md,
  centri-di-costo.md, fire.md, e2e-emulatori.md (§ Proving a refactor changed no number)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-06 per intero; PERF-05 è chiusa (2026-09-29)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Metodo: benchmark cold prima e dopo (npm run perf:bench -- --cold-only --routes=cashflow,analisi,fire-simulations); i test
dei bordi in ENTRAMBI i fusi (macchina e TZ=Europe/Rome), con fixture costruite come la form (new Date('YYYY-MM-DDT00:00:00'),
senza Z); le falsificazioni di § 7 viste ROSSE; la spec E2E della seconda finestra con anchor positivo. Chiusura: tsc,
lint 0, Vitest nei due fusi, npm run test:e2e COMPLETO; giro guidato di 5 punti sul mirror, poi mirror:remove; CLAUDE.md
«Latest», AGENTS.md, le guide, Draft Release Temp.md (senza dati privati), doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** I bordi delle finestre sono esattamente dove questo repo ha già preso tre bug di timezone
(CLAUDE.md § Known Issues, «Three Vitest cases fail under TZ=UTC») — e dove la prima stesura di questa spec ne ha messo un
quarto (UTC invece di locale, trovato in revisione): serve il modello che legge le guide di dominio e le applica ai bordi.
