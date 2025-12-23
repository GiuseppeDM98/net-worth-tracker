# 📝 Firebase Optimization - Changelog

Registro delle modifiche per ogni sessione di ottimizzazione Firebase.

---

## 📅 Sessione 1 - 23 Dicembre 2025

### ✅ Priority 1: Performance Page Optimization (COMPLETATA)

**Impatto**: **-99% query** (da 137 a 1-2 query per page load)

#### Modifiche Implementate

**File**: `lib/services/performanceService.ts`

1. **Nuova funzione `getCashFlowsFromExpenses()`** (linee 361-413)
   - Filtra expenses pre-fetchate per date range in-memory
   - Replica logica di `getCashFlowsForPeriod()` senza query Firestore
   - Raggruppa per mese e calcola totali income/expenses/netCashFlow
   - Returns: `CashFlowData[]` ordinato per data

2. **Parametro opzionale `preFetchedExpenses`** in `calculatePerformanceForPeriod()` (linea 427)
   - Aggiunto come 7° parametro opzionale: `preFetchedExpenses?: Expense[]`
   - Se presente, usa `getCashFlowsFromExpenses()` (in-memory)
   - Altrimenti fallback a `getCashFlowsForPeriod()` (Firestore)
   - Backward compatible: chiamate esistenti senza parametro funzionano invariate

3. **Refactoring `calculateRollingPeriods()`** (linee 548-568)
   - Batch fetch di TUTTE le expenses all'inizio (linee 548-554)
   - `const allExpenses = await getExpensesByDateRange(userId, overallStartDate, overallEndDate)`
   - Loop usa `getCashFlowsFromExpenses()` invece di query ripetute (linea 568)
   - **Eliminati 100+ query**: da N loop queries a 1 batch query

4. **Refactoring `getAllPerformanceData()`** (linee 501-523)
   - Pre-fetch di TUTTE le expenses per l'intera storia (linee 501-514)
   - Passa `allExpenses` a tutte e 5 le chiamate di `calculatePerformanceForPeriod()` (linee 518-522)
   - Rolling periods già ottimizzati internamente (calculateRollingPeriods già fa batch fetch)

#### Compilazione TypeScript

✅ **Nessun errore TypeScript** - Verificato con `npx tsc --noEmit`

#### Risultati Attesi

| Metrica | Prima | Dopo | Riduzione |
|---------|-------|------|-----------|
| **Performance Page Load** | 137 query | 1-2 query | **-99%** ✨ |
| **Rolling 12M** | ~48 query | 0 (batch) | **-100%** |
| **Rolling 36M** | ~84 query | 0 (batch) | **-100%** |
| **5 Time Periods** | 5 query | 0 (batch) | **-100%** |

#### Testing Status

⏳ **Testing manuale richiesto** (vedi `docs/testing-guide.md` sezione Priority 1)

- [ ] Browser DevTools: verificare 1-2 query totali
- [ ] Metriche identiche: ROI, CAGR, TWR, IRR, Sharpe Ratio
- [ ] Rolling charts renderizzano correttamente
- [ ] Custom date range funziona

#### Note Tecniche

- **Pattern usato**: Batch fetch + in-memory filtering
- **Backward compatibility**: ✅ Garantita (parametro opzionale)
- **Performance**: Zero impatto negativo, solo riduzione query
- **Manutenibilità**: Codice più pulito (logica centralizzata in getCashFlowsFromExpenses)

---

## 📅 Sessione 2 - 23 Dicembre 2025

### ✅ Priority 2: Cashflow Page Lazy Loading (COMPLETATA)

**Impatto**: **-75% query** (da 4 a 1 query al primo load)

#### Modifiche Implementate

**File**: `app/dashboard/cashflow/page.tsx`

1. **Import useState** (riga 3)
   - Aggiunto `import { useState } from 'react';`

2. **State tracking** (righe 12-13)
   - `mountedTabs: Set<string>` inizializzato con `new Set(['tracking'])`
   - `activeTab: string` inizializzato con `'tracking'`
   - Traccia quali tab sono stati visitati e quale è attivo

3. **Handler handleTabChange()** (righe 15-18)
   - Aggiorna `activeTab` quando l'utente cambia tab
   - Aggiunge il nuovo tab a `mountedTabs` usando `new Set(prev).add(value)`
   - Garantisce che i tab visitati rimangano montati

4. **Controlled Tabs component** (riga 34)
   - Aggiunto `value={activeTab}` per rendere il componente controllato
   - Aggiunto `onValueChange={handleTabChange}` per intercettare cambio tab

5. **Render condizionale** (righe 58-74)
   - Tab "tracking" (righe 54-56): sempre montato (default, no condizionale)
   - Tab "dividends" (righe 58-62): montato solo se `mountedTabs.has('dividends')`
   - Tab "current-year" (righe 64-68): montato solo se `mountedTabs.has('current-year')`
   - Tab "total-history" (righe 70-74): montato solo se `mountedTabs.has('total-history')`

#### Compilazione TypeScript

✅ **Nessun errore TypeScript** - Verificato con `npx tsc --noEmit`

#### Risultati Attesi

| Metrica | Prima | Dopo | Riduzione |
|---------|-------|------|-----------|
| **Cashflow Page Load** | 4 query | 1 query | **-75%** |
| **Tab Switch (già visitato)** | 0 query | 0 query | 0% |
| **Tab Switch (nuovo)** | 0 query | 1 query | N/A |

#### Testing Status

⏳ **Testing manuale richiesto** (vedi `docs/testing-guide.md` sezione Priority 2)

- [ ] Primo load: solo 1 query Firebase (solo ExpenseTrackingTab)
- [ ] Click "Dividendi": 1 nuova query (DividendTrackingTab monta)
- [ ] Switch back "Tracciamento": nessuna query (già montato)
- [ ] Click "Anno Corrente": 1 nuova query (CurrentYearTab monta)
- [ ] Click "Storico Totale": 1 nuova query (TotalHistoryTab monta, carica TUTTE le spese)
- [ ] Tutti i dati visualizzati correttamente
- [ ] Stato dei tab persiste quando si cambia tab

#### Note Tecniche

- **Pattern usato**: Lazy loading con mount tracking
- **Backward compatibility**: ✅ Garantita (solo ottimizzazione interna, nessun cambio API)
- **Performance**: Zero impatto negativo, solo riduzione query
- **UX**: Tab state persiste quando si switcha (miglioramento UX)
- **Type safety**: TypeScript `Set<string>` con compile-time checks
- **Complessità**: O(1) lookup per `mountedTabs.has()`

---

## 📅 Sessione 3 - 23 Dicembre 2025

### ✅ Tab Caching con "Lift State Up" Pattern (COMPLETATA)

**Impatto**: **0 query su tab switching** (da 1-2 query a 0 query per tab già visitato)

#### Problema Riscontrato

Dopo l'implementazione di Priority 2 (Lazy Loading), si è scoperto che:
- Primo load: 5 query invece di 1 attesa
- Tab switching: 1-2 nuove query per ogni tab
- Causa: ogni tab component aveva `useEffect` autonomo che ri-fetchava i dati quando montato

#### Soluzione Implementata

Refactoring completo con pattern "Lift State Up":
- Data fetching spostato dal child (tab components) al parent (cashflow/page.tsx)
- Children ricevono dati come props e fanno filtering in-memory
- Callback `onRefresh()` per triggare re-fetch dal parent

#### Modifiche Implementate

**File**: `app/dashboard/cashflow/page.tsx` (linee 19-70)

1. **Centralized data state** (linee 26-32)
   ```typescript
   const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
   const [categories, setCategories] = useState<ExpenseCategory[]>([]);
   const [dividends, setDividends] = useState<Dividend[]>([]);
   const [assets, setAssets] = useState<Asset[]>([]);
   const [loading, setLoading] = useState(true);
   const [dataLoaded, setDataLoaded] = useState(false);
   ```

2. **Batch fetching con Promise.all** (linee 40-45)
   ```typescript
   const [expensesData, categoriesData, dividendsData, assetsData] = await Promise.all([
     getAllExpenses(user.uid),
     getAllCategories(user.uid),
     fetch(`/api/dividends?userId=${user.uid}`).then(r => r.json()).then(d => d.dividends || []),
     getAllAssets(user.uid),
   ]);
   ```

3. **Props passati a tutti i tab** (linee 111-147)
   - ExpenseTrackingTab: `allExpenses`, `categories`, `loading`, `onRefresh`
   - DividendTrackingTab: `dividends`, `assets`, `loading`, `onRefresh`
   - CurrentYearTab: `allExpenses`, `loading`, `onRefresh`
   - TotalHistoryTab: `allExpenses`, `loading`, `onRefresh`

**File**: `components/cashflow/ExpenseTrackingTab.tsx`

1. **Props interface** (linee 39-44)
   - Riceve dati invece di fetchare autonomamente
   - Callback `onRefresh` per triggare refresh dal parent

2. **In-memory filtering con useEffect** (linee 59-73)
   - Filtra `allExpenses` invece di query Firestore
   - Re-run quando cambiano `allExpenses`, `selectedYear`, `selectedMonth`

3. **Rimossi**:
   - `useAuth()` hook
   - `loadCategories()`, `loadAllExpensesForYears()`, `loadExpenses()` functions
   - State: `expenses`, `categories`, `loading`
   - 3 useEffect con fetch autonomi

**File**: `components/dividends/DividendTrackingTab.tsx`

1. **Props interface** (linee 34-39)
   - Riceve `dividends`, `assets` dal parent

2. **Rimossi**:
   - `getAllAssets` import
   - `loadData()`, `fetchDividends()` functions
   - State: `dividends`, `assets`, `loading`
   - useEffect con fetch autonomo
   - Tutte le chiamate a `loadData()` sostituite con `onRefresh()`

**File**: `components/cashflow/CurrentYearTab.tsx`

1. **Props interface** (linee 62-66)
   - Riceve `allExpenses`, `loading`, `onRefresh`

2. **useMemo per filtering** (linee 113-118)
   ```typescript
   const currentYearExpenses = useMemo(() => {
     return allExpenses.filter(expense => {
       const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
       return date.getFullYear() === currentYear;
     });
   }, [allExpenses, currentYear]);
   ```

3. **Rimossi**:
   - `useAuth`, `getAllExpenses` imports
   - `loadExpenses()` function
   - State: `user`, `expenses`, `loading`
   - useEffect con fetch autonomo
   - `toast` import (non più usato)

**File**: `components/cashflow/TotalHistoryTab.tsx`

1. **Props interface** (linee 39-43)
   - Riceve `allExpenses`, `loading`, `onRefresh`

2. **Sostituzione globale**:
   - Tutte le 14 occorrenze di `expenses` → `allExpenses`
   - Filtraggio diretto su `allExpenses` invece di fetch separato

3. **Rimossi**:
   - `useAuth`, `getAllExpenses` imports
   - `loadExpenses()` function
   - State: `user`, `expenses`, `loading`
   - useEffect con fetch autonomo
   - `toast` import (non più usato)

#### Compilazione TypeScript

✅ **Nessun errore TypeScript** - Verificato con `npx tsc --noEmit`

#### Risultati Attesi

| Metrica | Prima | Dopo | Riduzione |
|---------|-------|------|-----------|
| **Cashflow Page Load** | 5 query | 4 query | **-20%** |
| **Tab Switch (già visitato)** | 1-2 query | 0 query | **-100%** ✨ |
| **Tab Switch (nuovo)** | 1-2 query | 0 query | **-100%** ✨ |
| **Data consistency** | Inconsistente | Consistente | N/A |

**Note**: Le 4 query iniziali sono batch fetching in parallelo (non sequenziali)

#### Testing Status

⏳ **Testing manuale richiesto**

- [ ] Primo load: esattamente 4 query Firebase (tutte in parallelo)
- [ ] Click "Dividendi": nessuna nuova query
- [ ] Click "Anno Corrente": nessuna nuova query
- [ ] Click "Storico Totale": nessuna nuova query (usa allExpenses già in cache)
- [ ] Switch back "Tracciamento": nessuna query
- [ ] Tutti i filtri funzionano correttamente (in-memory)
- [ ] Dati consistenti tra tab (stesso dataset)
- [ ] Refresh button: 4 nuove query, tutti i tab si aggiornano

#### Note Tecniche

- **Pattern usato**: Lift State Up + Batch Fetching + In-Memory Filtering
- **Backward compatibility**: ✅ Garantita (solo refactoring interno)
- **Performance**: Zero impatto negativo
  - Eliminati fetch duplicati
  - Dati cached in parent
  - Filtering in-memory O(n) invece di query Firestore
- **Data consistency**: Miglioramento significativo
  - Tutti i tab usano lo stesso dataset
  - Nessun rischio di dati inconsistenti tra tab
- **Type safety**: TypeScript completo con props interfaces
- **Code quality**: Ridotto codice duplicato (5 fetch functions → 1 centralized)

---

## 🔜 Prossime Sessioni

### Priority 3: Performance Page Snapshot Caching
**Status**: ⏳ Da implementare
**Impatto stimato**: -50% query snapshot

### Priority 4: Dashboard Page Duplicate Elimination
**Status**: ⏳ Da implementare
**Impatto stimato**: -50% query snapshot

### Priority 5: ExpenseTrackingTab In-Memory Filtering
**Status**: ⏳ Da implementare
**Impatto stimato**: -100% query su cambio filtri

### Priority 6: React.memo per Heavy Components
**Status**: ⏳ Da implementare
**Impatto stimato**: -30-40% re-render inutili

---

## 📊 Progressione Ottimizzazioni

### Dopo Sessione 2

- ✅ Priority 1 completata: -99% query Performance Page
- ✅ Priority 2 completata: -75% query Cashflow Page (lazy loading)
- ⏳ Priority 3-6: In attesa
- 📈 Riduzione stimata parziale: ~40-45% delle letture totali
- 🎯 Riduzione target finale (Fase 1): 60-70%

### Dopo Sessione 3

- ✅ Priority 1 completata: -99% query Performance Page
- ✅ Priority 2 completata + Tab Caching: -100% query su tab switching
- ⏳ Priority 3-6: In attesa
- 📈 Riduzione stimata parziale: ~50-55% delle letture totali
- 🎯 Riduzione target finale (Fase 1): 60-70%
- 💡 Bonus: Data consistency migliorata (single source of truth)

---

**Formato Template per Prossime Sessioni**:

```markdown
## 📅 Sessione X - [Data]

### ✅ Priority Y: [Nome] (COMPLETATA)

**Impatto**: **-X% query** ([dettagli])

#### Modifiche Implementate

**File**: `path/to/file.ts`

1. **Modifica 1** (linee X-Y)
   - Descrizione dettagliata
   - Codice chiave modificato

2. **Modifica 2** (linee A-B)
   - Descrizione dettagliata

#### Compilazione TypeScript

✅/❌ [Stato]

#### Risultati Attesi

| Metrica | Prima | Dopo | Riduzione |
|---------|-------|------|-----------|
| ... | ... | ... | ... |

#### Testing Status

- [ ] Test 1
- [ ] Test 2

#### Note Tecniche

- Pattern usato
- Backward compatibility
- Performance impact
```

---

**Ultima Modifica**: 23 Dicembre 2025
**Versione**: 1.0
