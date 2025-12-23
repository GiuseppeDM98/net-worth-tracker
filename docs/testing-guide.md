# 🧪 Firebase Optimization - Testing Guide

Guida completa per testare le ottimizzazioni Firebase implementate.

---

## 📋 Prerequisiti

### Strumenti Necessari

1. **Browser DevTools**
   - Chrome/Edge: F12 → Network tab
   - Filtrare per `firestore.googleapis.com`
   - Mostra tutte le richieste Firebase

2. **React DevTools** (Optional, per Priority 6)
   - [Chrome Extension](https://chrome.google.com/webstore/detail/react-developer-tools/)
   - Tab "Profiler" per misurare re-render

3. **Firebase Console**
   - [console.firebase.google.com](https://console.firebase.google.com)
   - Firestore → Usage → Database Reads (daily chart)

### Setup Pre-Test

1. **Apri DevTools** (F12)
2. **Network tab** → Click icona "Clear" (cestino)
3. **Filtra per**: `firestore.googleapis.com`
4. **Disable cache**: Check "Disable cache" in Network tab
5. **Hard refresh**: Ctrl+Shift+R (svuota cache browser)

---

## ✅ PRIORITY 1: Performance Page Optimization

**Status**: ✅ Implementata il 23/12/2025
**Target**: Da 137 query a 1-2 query

### Test 1: Verifica Query Count

#### Step 1: Apri Performance Page
1. Apri DevTools → Network tab → Clear
2. Filtra per `firestore.googleapis.com`
3. Naviga a `/dashboard/performance`
4. Aspetta che la pagina carichi completamente

#### Risultato Atteso
✅ **1-2 richieste Firestore totali** (non 100+)

**Screenshot Location**:
- `allExpenses` batch query: 1 richiesta
- `snapshots` query: 1 richiesta
- **Total**: 2 richieste max

#### Cosa Verificare
- [ ] Nessun loop di query (100+ richieste)
- [ ] Solo 1-2 richieste nel Network tab
- [ ] Page load time: <2 secondi
- [ ] Nessun errore console

---

### Test 2: Switch Time Periods

#### Step 2.1: Cambio Periodo
1. Con DevTools Network aperto e filtrato
2. Clear network log
3. Click "YTD" → "1Y" → "3Y" → "5Y" → "ALL"
4. Aspetta render tra ogni click

#### Risultato Atteso
✅ **Zero nuove query Firebase** (dati già in cache dall'initial load)

#### Cosa Verificare
- [ ] Nessuna nuova richiesta `firestore.googleapis.com`
- [ ] Metriche cambiano istantaneamente
- [ ] Nessun spinner/loading state

---

### Test 3: Custom Date Range

#### Step 3.1: Selezione Custom Range
1. Clear network log
2. Click "Custom Range"
3. Seleziona date custom (es. 01/01/2024 - 31/12/2024)
4. Click "Apply"

#### Risultato Atteso
✅ **1 query expense** (per calcolare metriche custom)
❌ **Zero query snapshot** (già in cache)

#### Cosa Verificare
- [ ] Solo 1 richiesta `getExpensesByDateRange`
- [ ] Metriche custom calcolate correttamente
- [ ] Chart si aggiorna con custom period

---

### Test 4: Verifica Metriche Identiche

**Critico**: Le ottimizzazioni NON devono cambiare i calcoli!

#### Step 4.1: Confronto Pre/Post Optimization
1. Annota metriche **PRIMA** dell'ottimizzazione (se disponibili):
   - ROI: __%
   - CAGR: __%
   - TWR: __%
   - IRR: __%
   - Sharpe Ratio: __
   - Volatility: __%

2. Dopo ottimizzazione, verifica valori identici

#### Risultato Atteso
✅ **Tutti i valori IDENTICI** (nessuna differenza)

#### Cosa Verificare
- [ ] ROI uguale a prima
- [ ] CAGR uguale a prima
- [ ] TWR uguale a prima
- [ ] IRR uguale a prima
- [ ] Sharpe Ratio uguale a prima
- [ ] Volatility uguale a prima
- [ ] Net Cash Flow uguale

---

### Test 5: Rolling Charts

#### Step 5.1: Rolling 12M Chart
1. Scroll fino a "Rolling 12-Month Performance"
2. Verifica chart renderizza correttamente
3. Hover su data points → tooltip mostra valori

#### Step 5.2: Rolling 36M Chart
1. Scroll fino a "Rolling 36-Month Performance"
2. Verifica chart renderizza correttamente
3. Hover su data points → tooltip mostra valori

#### Risultato Atteso
✅ **Charts renderizzano identici a prima**
✅ **Nessun errore console**
✅ **Tooltips funzionano**

#### Cosa Verificare
- [ ] Rolling 12M chart visualizzato
- [ ] Rolling 36M chart visualizzato
- [ ] CAGR line mostrata
- [ ] Sharpe Ratio line mostrata
- [ ] Tooltips funzionano
- [ ] Nessun "NaN" o valori strani

---

### Test 6: Regression Testing

#### Step 6.1: Other Pages Non Impattate
1. Naviga a `/dashboard` (overview)
2. Naviga a `/dashboard/cashflow`
3. Naviga a `/dashboard/assets`
4. Verifica tutto funziona come prima

#### Risultato Atteso
✅ **Nessun breaking change** su altre pagine

#### Cosa Verificare
- [ ] Dashboard loads correttamente
- [ ] Cashflow loads correttamente
- [ ] Assets loads correttamente
- [ ] Nessun errore console globale

---

## 🔲 PRIORITY 2: Cashflow Page Lazy Loading

**Status**: ⏳ Da implementare
**Target**: Da 4 query a 1 query al primo load

### Test 1: Initial Page Load

#### Step 1: Primo Caricamento
1. DevTools Network → Clear → Filtra `firestore`
2. Naviga a `/dashboard/cashflow`
3. Tab "Tracciamento" dovrebbe essere attivo di default
4. Conta richieste Firebase

#### Risultato Atteso
✅ **1 query totale** (solo Tracciamento tab)
❌ **NON 4 query** (tutti i tab)

#### Cosa Verificare
- [ ] Solo 1 richiesta `getAllExpenses`
- [ ] Tab "Tracciamento" mostra dati
- [ ] Altri tab vuoti (non ancora montati)

---

### Test 2: Tab Switching

#### Step 2.1: Click "Dividendi" Tab
1. Clear network log
2. Click tab "Dividendi"
3. Aspetta caricamento

#### Risultato Atteso
✅ **1 query** `getAllDividends` (prima volta)

#### Step 2.2: Click "Anno Corrente" Tab
1. Clear network log
2. Click tab "Anno Corrente"

#### Risultato Atteso
✅ **1 query** `getExpensesByMonth` (prima volta)

#### Step 2.3: Click "Storico Totale" Tab
1. Clear network log
2. Click tab "Storico Totale"

#### Risultato Atteso
✅ **1 query** `getAllExpenses` (carica TUTTE le spese)

#### Cosa Verificare
- [ ] Ogni tab fetcha dati solo alla prima visita
- [ ] "Storico Totale" carica tutte le spese (no limits)

---

### Test 3: Re-Visiting Tabs

#### Step 3.1: Torna a "Tracciamento"
1. Clear network log
2. Click tab "Tracciamento" (già visitato prima)

#### Risultato Atteso
✅ **Zero query** (tab già montato in memoria)

#### Step 3.2: Switch Multiple Times
1. "Dividendi" → "Anno Corrente" → "Tracciamento" → "Storico Totale"
2. Ripeti 3 volte

#### Risultato Atteso
✅ **Zero query** (tutti i tab già montati dopo prima visita)

#### Cosa Verificare
- [ ] Nessuna nuova query dopo prima visita
- [ ] Dati persistono tra switch
- [ ] Nessun re-fetch inutile

---

## 🔲 PRIORITY 3: Performance Page Snapshot Caching

**Status**: ⏳ Da implementare
**Target**: Da 2 fetch snapshot a 1 fetch

### Test 1: Initial Load

#### Step 1: Caricamento Iniziale
1. DevTools Network → Clear → Filtra `getUserSnapshots`
2. Naviga a `/dashboard/performance`
3. Conta quante volte `getUserSnapshots` viene chiamato

#### Risultato Atteso
✅ **1 chiamata** `getUserSnapshots` (non 2)

#### Cosa Verificare
- [ ] Solo 1 snapshot query al load
- [ ] Dati caricati correttamente
- [ ] Charts renderizzano

---

### Test 2: Period Changes

#### Step 2.1: Switch Periods
1. Clear network log
2. Click "YTD" → "1Y" → "3Y" → "5Y"
3. Verifica query Firebase

#### Risultato Atteso
✅ **Zero snapshot queries** (usa cache)

#### Cosa Verificare
- [ ] Nessuna richiesta `getUserSnapshots`
- [ ] Metriche cambiano istantaneamente
- [ ] Charts si aggiornano

---

### Test 3: Custom Date Range

#### Step 3.1: Custom Range
1. Clear network log
2. Click "Custom Range" → Select dates → Apply
3. Verifica query Firebase

#### Risultato Atteso
✅ **1 expense query** (per cash flows)
❌ **Zero snapshot queries** (usa cache)

#### Cosa Verificare
- [ ] Solo expense query
- [ ] Nessun re-fetch snapshot
- [ ] Custom metrics calcolate correttamente

---

## 🔲 PRIORITY 4: Dashboard Page Duplicate Elimination

**Status**: ⏳ Da implementare
**Target**: Da 2 fetch snapshot a 1 fetch

### Test 1: Initial Load

#### Step 1: Dashboard Load
1. DevTools Network → Clear → Filtra `getUserSnapshots`
2. Naviga a `/dashboard`
3. Conta chiamate `getUserSnapshots`

#### Risultato Atteso
✅ **1 chiamata** (non 2)

#### Cosa Verificare
- [ ] Solo 1 snapshot query
- [ ] Cards mostrano variazioni corrette
- [ ] Charts renderizzano

---

### Test 2: Create Snapshot Flow

#### Step 2.1: Click "Crea Snapshot"
1. Clear network log
2. Click bottone "Crea Snapshot"
3. Verifica query Firebase

#### Risultato Atteso
✅ **Zero snapshot queries** (usa cache per check duplicati)

#### Step 2.2: Confirm Snapshot Creation
1. Click "Conferma" nel dialog
2. Verifica query Firebase

#### Risultato Atteso
✅ **1 snapshot query** (refresh dopo creazione)

#### Cosa Verificare
- [ ] Check duplicati usa cache (zero query)
- [ ] Creazione snapshot refresha dati (1 query)
- [ ] Dashboard si aggiorna correttamente

---

## 🔲 PRIORITY 5: ExpenseTrackingTab In-Memory Filtering

**Status**: ⏳ Da implementare
**Target**: Zero query su cambio filtri

### Test 1: Initial Load

#### Step 1: Cashflow Tab Load
1. DevTools Network → Clear → Filtra `getAllExpenses`
2. Vai a `/dashboard/cashflow` → Tab "Tracciamento"
3. Conta query

#### Risultato Atteso
✅ **1 query** `getAllExpenses` (fetch tutto)

#### Cosa Verificare
- [ ] Solo 1 query iniziale
- [ ] Tutti gli anni disponibili mostrati
- [ ] Dati del mese corrente visualizzati

---

### Test 2: Filter Changes

#### Step 2.1: Cambio Anno
1. Clear network log
2. Click anno "2024" → "2023" → "2025"
3. Verifica query Firebase

#### Risultato Atteso
✅ **Zero query** (filtraggio in-memory)

#### Step 2.2: Cambio Mese
1. Clear network log
2. Click mese "Gennaio" → "Febbraio" → "Marzo"
3. Verifica query Firebase

#### Risultato Atteso
✅ **Zero query** (filtraggio in-memory)

#### Step 2.3: Cambio Anno + Mese
1. Clear network log
2. Anno "2024" → Mese "Dicembre"
3. Anno "2023" → Mese "Gennaio"
4. Verifica query Firebase

#### Risultato Atteso
✅ **Zero query** (filtraggio in-memory)

#### Cosa Verificare
- [ ] Nessuna query su cambio anno
- [ ] Nessuna query su cambio mese
- [ ] Dati filtrati correttamente
- [ ] Expenses visualizzate corrispondono al filtro

---

### Test 3: Add/Edit/Delete Expense

#### Step 3.1: Aggiungi Spesa
1. Clear network log
2. Click "Aggiungi Spesa" → Fill form → Save
3. Verifica query Firebase

#### Risultato Atteso
✅ **1 query** `getAllExpenses` (refresh dopo creazione)

#### Cosa Verificare
- [ ] 1 query per refresh
- [ ] Nuova spesa visualizzata
- [ ] Filtri ancora funzionanti

---

## 🔲 PRIORITY 6: React.memo per Heavy Components

**Status**: ⏳ Da implementare
**Target**: -30-40% re-render inutili

### Test 1: ExpenseTable Re-Renders

**Richiede**: React DevTools Profiler

#### Step 1.1: Record Baseline
1. Apri React DevTools → Profiler tab
2. Click "Record" (red circle)
3. Naviga a Cashflow → Add expense (NO save)
4. Click "Stop"
5. Annota render count di ExpenseTable

#### Step 1.2: Post-Optimization
1. Repeat step 1.1 dopo implementazione React.memo
2. Confronta render count

#### Risultato Atteso
✅ **ExpenseTable renders: 1** (solo initial render, no re-render quando parent cambia)

#### Cosa Verificare
- [ ] Render count ridotto
- [ ] ExpenseTable non re-renderizza se expenses array identico
- [ ] Performance migliore

---

### Test 2: DividendTable Re-Renders

#### Step 2.1: Same as Test 1
1. Usa DividendTrackingTab invece di ExpenseTrackingTab
2. Record renders con Profiler
3. Confronta pre/post optimization

#### Risultato Atteso
✅ **DividendTable renders: 1** (no unnecessary re-renders)

#### Cosa Verificare
- [ ] Render count ridotto
- [ ] No flicker/flash durante parent updates

---

## 📊 Summary Testing Checklist

### Priority 1 (Performance Page) ✅ Implementata
- [ ] 1-2 query totali al load (non 137)
- [ ] Zero query su period changes
- [ ] 1 query su custom date range
- [ ] Metriche identiche a prima
- [ ] Rolling charts funzionano

### Priority 2 (Cashflow Lazy Loading) ⏳
- [ ] 1 query al primo load (non 4)
- [ ] 1 query per tab alla prima visita
- [ ] Zero query su re-visiting tabs

### Priority 3 (Performance Cache) ⏳
- [ ] 1 snapshot query al load (non 2)
- [ ] Zero snapshot queries su changes

### Priority 4 (Dashboard Cache) ⏳
- [ ] 1 snapshot query al load (non 2)
- [ ] Zero queries per check duplicati

### Priority 5 (ExpenseTracking Filter) ⏳
- [ ] 1 query al load
- [ ] Zero queries su cambio filtri

### Priority 6 (React.memo) ⏳
- [ ] Render count ridotto
- [ ] No re-render inutili

---

## 🐛 Troubleshooting

### Problema: Vedo ancora 100+ query

**Causa**: Ottimizzazione non applicata correttamente

**Fix**:
1. Verifica file modificato: `lib/services/performanceService.ts`
2. Check git diff: `git diff lib/services/performanceService.ts`
3. Restart dev server: `npm run dev`
4. Hard refresh browser: Ctrl+Shift+R

---

### Problema: Metriche diverse dopo ottimizzazione

**Causa CRITICA**: Bug nei calcoli!

**Fix URGENTE**:
1. Rollback: `git checkout lib/services/performanceService.ts`
2. Verifica logica `getCashFlowsFromExpenses()`
3. Confronta con `getCashFlowsForPeriod()` linea per linea
4. Fix e re-test

---

### Problema: Tab non caricano dati

**Causa**: Render condizionale non funziona

**Fix**:
1. Check `mountedTabs` state
2. Verifica `handleTabChange()` aggiunge tab al Set
3. Console log: `console.log('mountedTabs:', Array.from(mountedTabs))`

---

**Ultima Modifica**: 23 Dicembre 2025
**Versione**: 1.0
