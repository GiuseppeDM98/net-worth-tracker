# 🔥 Firebase Optimization Plan - Portfolio Tracker

**Data Creazione**: 23 Dicembre 2025
**Obiettivo**: Ridurre letture Firebase da 50K/giorno a 15-20K/giorno (**-60-70%**)
**Approccio**: Ibrido - Fase 1 (Quick Wins) + Fase 2 (React Query)

---

## 📊 Situazione Attuale

### Problema
L'app raggiunge **50K+ letture Firebase al giorno** anche con testing moderato, superando il limite free tier.

### Analisi Completata
- ✅ 3 agenti Explore hanno analizzato **56+ query Firestore**
- ✅ Identificati pattern problematici: query senza limiti, loop con N query, doppi fetch, zero caching
- ✅ **Performance Page**: 100-200+ query per caricamento (calculateRollingPeriods loop)
- ✅ **Cashflow Page**: 4x query simultanee (tutti i tab eager-load)
- ✅ **Dashboard Page**: snapshot fetchati 2 volte in pochi secondi
- ✅ Nessuna libreria di caching (no React Query, no SWR)

### Impatto Stimato Totale

| Pagina/Area | Prima | Dopo | Riduzione |
|-------------|-------|------|-----------|
| **Performance Page** | 137 query | 1-2 query | **-99%** ✨ |
| **Cashflow Page** | 4 query | 1 query | **-75%** |
| **Dashboard Page** | 3-4 query | 2-3 query | **-33%** |
| **ExpenseTrackingTab (filtri)** | N query | 0 query | **-100%** |

**Riduzione Complessiva**: **60-70% delle letture Firebase totali**

---

## 🎯 FASE 1: Quick Wins (6 Priority)

Ottimizzazioni immediate senza aggiungere React Query.

### ✅ PRIORITY 1: Performance Page Optimization (COMPLETATA)

**Status**: ✅ Implementata il 23/12/2025
**Impatto**: -99% query (da 137 a 1-2 query)

#### Problema
`calculateRollingPeriods()` chiama `getCashFlowsForPeriod()` N volte in un loop, generando 100+ query Firestore.

#### Soluzione Implementata
1. Nuova funzione `getCashFlowsFromExpenses()` per filtraggio in-memory
2. Batch fetch di TUTTE le expenses all'inizio
3. Loop usa filtraggio in-memory invece di query ripetute
4. Parametro opzionale `preFetchedExpenses` in `calculatePerformanceForPeriod()`

#### File Modificati
- `lib/services/performanceService.ts` (linee 361-413, 420-427, 477-480, 501-523, 548-568)

---

### 🔲 PRIORITY 2: Cashflow Page Lazy Loading

**Status**: ⏳ Da implementare
**Impatto**: -75% query (da 4 a 1 query al primo load)

#### Problema
I 4 tab della Cashflow page sono sempre montati simultaneamente, ognuno fetcha i propri dati anche se invisibile.

#### Soluzione
Lazy loading con mount tracking: solo il tab attivo carica i dati, gli altri vengono montati on-demand.

#### Prompt per l'Implementazione

```
Implementa la Priority 2: Cashflow Page Lazy Loading seguendo il piano in docs/firebase-optimization-plan.md

Devi modificare app/dashboard/cashflow/page.tsx per:

1. Aggiungere state tracking:
   - mountedTabs: Set<string> inizializzato con ['tracking']
   - activeTab: string per tracciare il tab attivo

2. Implementare handleTabChange():
   - Aggiorna activeTab
   - Aggiungi il nuovo tab a mountedTabs (usando new Set)

3. Render condizionale per i tab:
   - "tracking" sempre montato (default)
   - "dividends", "current-year", "total-history" montati solo se in mountedTabs

4. Collegare handler a Tabs component con onValueChange

Vincolo: "Storico Totale" DEVE caricare tutte le spese (non aggiungere limiti).

Test: Verifica con DevTools Network che solo 1 query viene eseguita al primo load, non 4.

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Priority 2 completata
- File modificato: app/dashboard/cashflow/page.tsx (linee modificate)
- Modifiche implementate (state tracking, handleTabChange, render condizionale)
- Risultati attesi (-75% query)
- Testing status (link a docs/testing-guide.md sezione Priority 2)
```

#### File da Modificare
- `app/dashboard/cashflow/page.tsx` (linee 10-63)

#### Test Critici
- [ ] Primo load: solo "Tracciamento" fetcha dati (1 query, non 4)
- [ ] Click "Dividendi": fetcha dividendi (1 query)
- [ ] Switch back "Tracciamento": nessuna query (già montato)
- [ ] "Storico Totale": carica TUTTE le spese come richiesto

---

### 🔲 PRIORITY 3: Performance Page Snapshot Caching

**Status**: ⏳ Da implementare
**Impatto**: -50% query snapshot

#### Problema
`getUserSnapshots()` viene chiamato 2 volte: durante `getAllPerformanceData()` e in `getChartData()`.

#### Soluzione
Cache degli snapshots con useState, useMemo per chart data.

#### Prompt per l'Implementazione

```
Implementa la Priority 3: Performance Page Snapshot Caching seguendo il piano in docs/firebase-optimization-plan.md

Devi modificare app/dashboard/performance/page.tsx per:

1. Aggiungere cache state:
   - cachedSnapshots: MonthlySnapshot[] inizializzato vuoto

2. Modificare loadPerformanceData():
   - Fetchare snapshots UNA volta
   - Salvare in cachedSnapshots con setCachedSnapshots()
   - Passare a getAllPerformanceData() (che internamente li usa)

3. Usare cache in handleCustomDateRange():
   - Passare cachedSnapshots invece di ri-fetchare
   - Chiamare calculatePerformanceForPeriod() con snapshots cachati

4. Memoizzare chartData con useMemo:
   - Dipendenze: [cachedSnapshots, selectedPeriod]
   - Chiama preparePerformanceChartData() dentro useMemo

Test: Verifica che cambiare periodo (YTD → 1Y → 3Y) non generi nuove query Firebase.

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Priority 3 completata
- File modificato: app/dashboard/performance/page.tsx (linee modificate)
- Modifiche implementate (cachedSnapshots state, useMemo chartData)
- Risultati attesi (-50% query snapshot)
- Testing status (link a docs/testing-guide.md sezione Priority 3)
```

#### File da Modificare
- `app/dashboard/performance/page.tsx`

#### Test Critici
- [ ] Cambio periodo (YTD → 1Y → 3Y): nessuna query aggiuntiva
- [ ] Custom date range: solo 1 query expense (nessun re-fetch snapshot)

---

### 🔲 PRIORITY 4: Dashboard Page Duplicate Elimination

**Status**: ⏳ Da implementare
**Impatto**: -50% query snapshot

#### Problema
`getUserSnapshots()` viene chiamato in `loadAssets()` e di nuovo in `handleCreateSnapshot()` per check duplicati.

#### Soluzione
Cache degli snapshots in state per riutilizzo immediato.

#### Prompt per l'Implementazione

```
Implementa la Priority 4: Dashboard Page Duplicate Elimination seguendo il piano in docs/firebase-optimization-plan.md

Devi modificare app/dashboard/page.tsx per:

1. Aggiungere cache state:
   - cachedSnapshots: MonthlySnapshot[] inizializzato vuoto

2. Modificare loadAssets():
   - Dopo getUserSnapshots(), salvare in cachedSnapshots
   - Usare cachedSnapshots per tutti i calcoli (variation, etc.)

3. Modificare handleCreateSnapshot():
   - Usare cachedSnapshots.find() invece di fetchare di nuovo
   - Check duplicati avviene in-memory

4. Refresh cache dopo creazione:
   - loadAssets() ricarica tutto incluso cache aggiornato

Test: Verifica che click su "Crea Snapshot" non generi nuova query (usa cache).

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Priority 4 completata
- File modificato: app/dashboard/page.tsx (linee modificate)
- Modifiche implementate (cachedSnapshots state, check duplicati in-memory)
- Risultati attesi (-50% query snapshot)
- Testing status (link a docs/testing-guide.md sezione Priority 4)
```

#### File da Modificare
- `app/dashboard/page.tsx` (linee 76, 146)

#### Test Critici
- [ ] Load dashboard: 1 fetch snapshot
- [ ] Click "Crea Snapshot": nessun fetch (usa cache)
- [ ] Conferma creazione: 1 fetch per refresh

---

### 🔲 PRIORITY 5: ExpenseTrackingTab In-Memory Filtering

**Status**: ⏳ Da implementare
**Impatto**: -100% query su cambio filtri

#### Problema
Due useEffect: uno carica TUTTE le spese, un altro carica spese filtrate. Ogni cambio anno/mese ri-fetcha da Firestore.

#### Soluzione
Single fetch + filtraggio in-memory con useMemo.

#### Prompt per l'Implementazione

```
Implementa la Priority 5: ExpenseTrackingTab In-Memory Filtering seguendo il piano in docs/firebase-optimization-plan.md

Devi modificare components/cashflow/ExpenseTrackingTab.tsx per:

1. Eliminare secondo useEffect che chiama loadExpenses():
   - Rimuovere l'intero useEffect che dipende da [user, selectedYear, selectedMonth]

2. Modificare il primo useEffect:
   - Rinominare loadAllExpensesForYears() in loadAllExpenses()
   - Fetchare SOLO con getAllExpenses() (no getExpensesByMonth)

3. Creare filtered expenses con useMemo:
   - Filtrare allExpenses per selectedYear e selectedMonth
   - Dipendenze: [allExpenses, selectedYear, selectedMonth]
   - Logica: expenseYear === selectedYear && (month === 'all' || expenseMonth === parseInt(selectedMonth))

4. Usare filtered expenses per rendering:
   - Sostituire lo state expenses con il valore memoizzato

Test: Verifica che cambio anno/mese non generi query Firebase (solo filtraggio client-side).

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Priority 5 completata
- File modificato: components/cashflow/ExpenseTrackingTab.tsx (linee modificate)
- Modifiche implementate (eliminato secondo useEffect, useMemo filtering)
- Risultati attesi (-100% query su cambio filtri)
- Testing status (link a docs/testing-guide.md sezione Priority 5)
```

#### File da Modificare
- `components/cashflow/ExpenseTrackingTab.tsx` (linee 160-171)

#### Test Critici
- [ ] Load tab: 1 query (getAllExpenses)
- [ ] Cambio anno: nessuna query (filtraggio in-memory)
- [ ] Cambio mese: nessuna query (filtraggio in-memory)
- [ ] Aggiungi spesa: 1 query per refresh
- [ ] Bottoni anno disponibili popolati correttamente

---

### 🔲 PRIORITY 6: React.memo per Heavy Components

**Status**: ⏳ Da implementare
**Impatto**: -30-40% re-render inutili

#### Problema
ExpenseTable e DividendTable re-renderizzano anche quando le props non cambiano.

#### Soluzione
Wrappare con React.memo per memoizzazione automatica.

#### Prompt per l'Implementazione

```
Implementa la Priority 6: React.memo per Heavy Components seguendo il piano in docs/firebase-optimization-plan.md

Devi modificare:

1. components/expenses/ExpenseTable.tsx:
   - Import { memo } from 'react'
   - Rinominare export in ExpenseTableComponent
   - Export finale: export const ExpenseTable = memo(ExpenseTableComponent)

2. components/dividends/DividendTable.tsx:
   - Import { memo } from 'react'
   - Rinominare export in DividendTableComponent
   - Export finale: export const DividendTable = memo(DividendTableComponent)

Pattern:
```typescript
import { memo } from 'react';

const ComponentNameComponent = ({ props }) => {
  // codice esistente
};

export const ComponentName = memo(ComponentNameComponent);
```

Test: Usa React DevTools Profiler per verificare riduzione re-render quando dati non cambiano.

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Priority 6 completata
- File modificati:
  - components/expenses/ExpenseTable.tsx (wrapped con memo)
  - components/dividends/DividendTable.tsx (wrapped con memo)
- Modifiche implementate (React.memo wrappers)
- Risultati attesi (-30-40% re-render inutili)
- Testing status (link a docs/testing-guide.md sezione Priority 6)
```

#### File da Modificare
- `components/expenses/ExpenseTable.tsx`
- `components/dividends/DividendTable.tsx`

#### Test Critici
- [ ] ExpenseTable non re-renderizza se expenses array identico
- [ ] DividendTable non re-renderizza se dividends array identico
- [ ] React DevTools Profiler mostra riduzione render count

---

## 🚀 FASE 2: React Query (Futuro)

**Status**: 📅 Pianificata (dopo Fase 1 stabile)
**Impatto Aggiuntivo**: -40-50% query
**Total Combined Reduction**: ~80-85% letture Firebase

### Obiettivo
Implementare cache globale con invalidation automatica, eliminando letture ridondanti tra componenti.

### Cosa Implementare

#### 1. Setup React Query

**Prompt**:
```
Aggiungi React Query (TanStack Query) al progetto per cache globale Firebase.

1. Installa dipendenza:
   npm install @tanstack/react-query

2. Setup QueryClient in app/layout.tsx:
   - Import QueryClient, QueryClientProvider
   - Wrapper tutto con QueryClientProvider
   - Configurare staleTime, cacheTime, refetchOnWindowFocus

3. Opzionale: React Query Devtools per debug
   - Import ReactQueryDevtools
   - Aggiungere in development mode

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Fase 2 Step 1: Setup React Query completato
- File modificato: app/layout.tsx (+ package.json)
- Modifiche implementate (QueryClientProvider, dipendenza installata)
- Testing status
```

#### 2. Custom Hooks con useQuery

**Prompt**:
```
Crea custom hooks in lib/hooks/ per i data fetching principali:

1. lib/hooks/useAssets.ts:
   - useQuery con key ['assets', userId]
   - Fetcher: getAllAssets(userId)
   - staleTime: 5 minuti (dati relativamente statici)

2. lib/hooks/useSnapshots.ts:
   - useQuery con key ['snapshots', userId]
   - Fetcher: getUserSnapshots(userId)
   - staleTime: 1 minuto (aggiornati frequentemente)

3. lib/hooks/useExpenses.ts:
   - useQuery con key ['expenses', userId, year, month]
   - Fetcher: getExpensesByDateRange() o getAllExpenses()
   - staleTime: 30 secondi (modificati spesso)

4. lib/hooks/useDividends.ts:
   - useQuery con key ['dividends', userId]
   - Fetcher: getAllDividends(userId)

Pattern:
```typescript
export function useAssets() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['assets', user?.uid],
    queryFn: () => getAllAssets(user!.uid),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Fase 2 Step 2: Custom Hooks completati
- File creati:
  - lib/hooks/useAssets.ts
  - lib/hooks/useSnapshots.ts
  - lib/hooks/useExpenses.ts
  - lib/hooks/useDividends.ts
- Modifiche implementate (4 custom hooks con useQuery)
- Testing status
```

#### 3. Refactoring Componenti

**Prompt**:
```
Refactora i componenti per usare i custom hooks invece di useEffect + useState:

1. Dashboard page:
   - Sostituire useEffect con useAssets() e useSnapshots()
   - Rimuovere state locale (assets, snapshots, loading)
   - Usare data, isLoading, error da useQuery

2. Cashflow tabs:
   - ExpenseTrackingTab usa useExpenses()
   - DividendTrackingTab usa useDividends()
   - Rimuovere tutti i useEffect di fetching

3. Performance page:
   - Usa useSnapshots() per cache automatica
   - Rimuovere cachedSnapshots state (gestito da React Query)

Benefit:
- Automatic caching tra componenti
- Automatic background refetch
- Optimistic updates possibili
- Loading/error states unificati

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Fase 2 Step 3: Refactoring Componenti completato
- File modificati:
  - app/dashboard/page.tsx
  - components/cashflow/ExpenseTrackingTab.tsx
  - components/dividends/DividendTrackingTab.tsx
  - app/dashboard/performance/page.tsx
- Modifiche implementate (useEffect rimossi, custom hooks integrati)
- Testing status
```

#### 4. Invalidation dopo Mutazioni

**Prompt**:
```
Setup invalidation automatica dopo create/update/delete:

1. Usa useMutation per operazioni write:
   - createAsset, updateAsset, deleteAsset
   - createExpense, updateExpense, deleteExpense

2. Invalidate cache dopo successo:
   - onSuccess: () => queryClient.invalidateQueries(['assets'])
   - onSuccess: () => queryClient.invalidateQueries(['expenses'])

Pattern:
```typescript
const createAssetMutation = useMutation({
  mutationFn: (data) => createAsset(user.uid, data),
  onSuccess: () => {
    queryClient.invalidateQueries(['assets', user.uid]);
    toast.success('Asset creato');
  },
});
```

Benefit:
- Zero stale data
- Automatic refetch dopo modifiche
- Consistency garantita

DOPO IMPLEMENTAZIONE:
Aggiorna docs/changelog.md aggiungendo una nuova sezione per questa sessione con:
- Data sessione
- Fase 2 Step 4: Invalidation completata
- File modificati (tutti i componenti con create/update/delete operations)
- Modifiche implementate (useMutation con invalidateQueries)
- Testing status
- Risultati finali Fase 2: -40-50% reads aggiuntivi (combinato con Fase 1: ~80-85% totale)
```

### Stima Impatto Fase 2

| Area | Riduzione Aggiuntiva |
|------|----------------------|
| Cross-component cache | -30-40% |
| Background refetch optimization | -5-10% |
| Optimistic updates | -5% |
| **TOTAL** | **-40-50%** |

**Combined (Fase 1 + Fase 2)**: **~80-85% riduzione totale**

---

## 📈 Metriche di Successo

### Come Misurare le Ottimizzazioni

#### 1. Firebase Console
- Vai su **Firebase Console → Firestore → Usage**
- Sezione **Database Reads** (daily chart)
- **Before**: ~50K reads/day
- **After Fase 1**: ~15-20K reads/day
- **After Fase 2**: ~8-10K reads/day

#### 2. Browser DevTools
- Apri **DevTools → Network tab**
- Filtra per `firestore.googleapis.com`
- Conta le richieste per ogni page load:
  - Performance Page: 1-2 query (non 137)
  - Cashflow Page: 1 query (non 4)
  - Dashboard: 2-3 query (non 4-5)

#### 3. React DevTools Profiler
- Installa **React DevTools** extension
- Tab **Profiler**
- Record durante navigazione
- Verificare riduzione render count dopo Priority 6

### Obiettivi Misurabili

- ✅ Performance Page: da 100+ a 1-2 query
- ✅ Cashflow Page: da 4 a 1 query al primo load
- ✅ Daily Firebase reads: da 50K a 15-20K
- ✅ Nessun degrado UX (tempi caricamento uguali o migliori)
- ✅ Zero bug/regression nei calcoli

---

## 🔒 Safety & Rollback

### Backward Compatibility

✅ **Tutti i cambiamenti sono ottimizzazioni interne**
✅ **Nessun cambiamento di API contract**
✅ **Nessuna modifica schema database**
✅ **Nessun breaking change user-facing**

### Rollback Strategy

Ogni ottimizzazione è isolata e può essere rollback indipendentemente:

```bash
# Performance service
git checkout lib/services/performanceService.ts

# Cashflow lazy loading
git checkout app/dashboard/cashflow/page.tsx

# Dashboard cache
git checkout app/dashboard/page.tsx

# Memoization
git checkout components/expenses/ExpenseTable.tsx components/dividends/DividendTable.tsx
```

### Risk Mitigation

1. **Test su staging** prima di production deploy
2. **Monitor Firebase Console** dopo ogni deploy
3. **Gradual rollout**: deployare un'ottimizzazione alla volta
4. **Feature flag**: Aggiungere env var `ENABLE_OPTIMIZATION_X=true` per toggles
5. **Backup branch**: Mantenere `main` branch sempre stabile

---

## 🚫 Cosa NON Fare

❌ **NON aggiungere React Query in Fase 1** (sarà Fase 2)
❌ **NON modificare schema Firestore**
❌ **NON aggiungere server-side pagination** (breaking change)
❌ **NON aggiungere limiti a "Storico Totale"** (user requirement)
❌ **NON cambiare comportamento user-facing**
❌ **NON skippare i test** (regression critico)

---

## 📚 Riferimenti

- **Changelog**: `docs/changelog.md` (registro modifiche per sessione)
- **Testing Guide**: `docs/testing-guide.md` (test manuali dettagliati)
- **Plan originale**: `.claude/plans/imperative-petting-blum.md`

---

**Ultima Modifica**: 23 Dicembre 2025
**Autore**: Claude Sonnet 4.5 + Giuseppe Di Maio
**Versione**: 1.0
